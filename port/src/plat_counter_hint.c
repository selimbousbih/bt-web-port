/* An animation forecast, not a second simulation: never advances animations, runs collision tests, or writes
 * game state. A nearby opponent's FIRST hit-start event estimates the next counter opportunity. Actual contact
 * can be later (or miss entirely). Keep this distinction in the overlay and its documentation. */
#include <stddef.h>
#include <stdint.h>
#include <string.h>
#include <pthread.h>
#include "port_compat.h"
#include "port_host.h"
#include "battle/battle.h"
#include "battle/bobj_a.h"
#include "battle/btl_char_move.h"
#include "gs/counter_hint.h"

extern void *BtlChar_FindBySide(int side);
extern BobjObj *BtlChar_GetObj(void *chr);
extern int BtlChar_TestFlag(void *chr, int bit);
extern int BtlChar_TestPrevFlag(void *chr, int bit);
extern int BtlChar_IsFree(void *chr);
extern int BtlChars_IsTimeStopped(void);
extern int BtlAnim_GetId(void *chr);
extern unsigned BtlAnim_GetFlags(int anim);
extern int BtlAtk_GetId(void *chr);
extern unsigned BtlAtk_GetFlags(void *chr);
extern float BtlOpp_GetYawFromFacing(void *chr);
extern int BtlOpp_GetPlayer(void *chr);
extern int BtlChar_GetFrame(void);
extern int BtlInput_IsPressed(void *chr, unsigned mask);
extern int BtlInput_IsHeld(void *chr, unsigned mask);
extern int gPortResim;

PORT_HOST static pthread_mutex_t sLock = PTHREAD_MUTEX_INITIALIZER;
PORT_HOST static CounterHintPlayer sHint[2];
PORT_HOST static int sWasSuccess[2];
typedef struct CounterAttempt {
    BobjAnim *motion;
    unsigned animId;
    float frame, first;
    int tick, lastInputTick, tracked;
} CounterAttempt;
PORT_HOST static CounterAttempt sAttempt[2];

static void feedback(CounterHintPlayer *out, int result) {
    out->result = result;
    out->resultSerial++;
}

/* This field is outside BtlMoveChr's partial view (btl_char_get.h documents the complete offset). */
static int cpu_controlled(const void *chr) {
    int inject;
    memcpy(&inject, (const unsigned char *)chr + 0x1278, sizeof(inject));
    return inject != 0;
}

static int forecast(BtlMoveChr *atk, BtlMoveChr *def, BobjObj *aobj, BobjObj *dobj) {
    BobjAnim *anim = aobj->anim.layer[0].data;
    float frame = aobj->anim.frame, step = aobj->anim.step;
    float dx, dy, dz, reach, left;
    int i, ticks;

    if (anim == NULL || !(step > 0.0f) || BtlAtk_GetId(atk) < 0 ||
        !BtlChar_IsFree(def) || !(BtlAnim_GetFlags(BtlAnim_GetId(def)) & 0x31)) {
        return 0;
    }
    if (!(BtlAtk_GetFlags(atk) & 8) &&
        !(BtlOpp_GetYawFromFacing(atk) > -1.5707963f && BtlOpp_GetYawFromFacing(atk) < 1.5707963f)) {
        return 0;
    }
    /* A coarse range gate, deliberately not advertised as a collision prediction. Body size[0] is height. */
    dx = def->pose.pos.x - atk->pose.pos.x;
    dy = def->pose.pos.y - atk->pose.pos.y;
    dz = def->pose.pos.z - atk->pose.pos.z;
    reach = aobj->body.radius + dobj->body.radius + aobj->body.size[0];
    if (!(reach > 0.0f) || dx * dx + dy * dy + dz * dz > reach * reach) {
        return 0;
    }
    for (i = 0; i < anim->eventCount; i++) {
        if (anim->event[i].attrLo & BOBJ_EV_HIT_BEGIN) {
            /* Only hit index 0 can pass BtlHit_CheckGuard's Z-counter branch. Never forecast a later hit. */
            left = (float)anim->event[i].frame - (frame + 1.0f / 60.0f);
            if (!(left > 0.0f) || anim->event[i].arg == 0) {
                return 0;
            }
            for (ticks = 1; ticks <= COUNTER_HINT_LEAD_TICKS; ticks++) {
                if (left <= step * (float)ticks) {
                    return ticks;
                }
            }
            return 0;
        }
    }
    return 0;
}

static void judge_attempt(int p, CounterHintPlayer *out, BtlMoveChr *def, BobjObj *attacker, int lead) {
    CounterAttempt *a = &sAttempt[p];
    int tick = BtlChar_GetFrame(), i, up, rush;
    if (a->tracked && (a->motion != attacker->anim.layer[0].data || a->animId != attacker->anim.layer[0].id ||
        attacker->anim.frame < a->frame || tick < a->tick || tick - a->tick > COUNTER_HINT_LEAD_TICKS)) {
        a->tracked = 0; /* cancelled/replaced attack, animation loop, rematch, or stale opportunity */
    }
    if (lead > 0) {
        BobjAnim *motion = attacker->anim.layer[0].data;
        for (i = 0; i < motion->eventCount; i++) {
            if (motion->event[i].attrLo & BOBJ_EV_HIT_BEGIN) {
                a->first = motion->event[i].frame;
                break;
            }
        }
        a->motion = motion;
        a->animId = attacker->anim.layer[0].id;
        a->tick = tick;
        a->tracked = 1;
    }
    a->frame = attacker->anim.frame;
    if (tick == a->lastInputTick) { return; } /* the same input must not be judged again on another DMA list */
    a->lastInputTick = tick;
    if (!a->tracked) { return; }
    up = BtlInput_IsPressed(def, 0x10);
    rush = BtlInput_IsPressed(def, 0x08);
    if (!((up && BtlInput_IsHeld(def, 0x08)) || (rush && BtlInput_IsHeld(def, 0x10)))) {
        return; /* ordinary attacks and movement are not failed counter attempts */
    }
    if (!(up && rush)) {
        feedback(out, COUNTER_RESULT_TOGETHER);
    } else if (def->unk1070 != 1) {
        feedback(out, COUNTER_RESULT_NOT_READY);
    } else if (a->first > attacker->anim.frame + 1.0f / 60.0f) {
        feedback(out, COUNTER_RESULT_EARLY);
    } else if (a->first <= attacker->anim.prevFrame + 1.0f / 60.0f) {
        feedback(out, COUNTER_RESULT_LATE);
    } else {
        /* Animation timing alone cannot explain a miss on the predicted update (for example, no contact). */
        feedback(out, COUNTER_RESULT_MISSED);
    }
}

void Port_CounterHintSample(void) {
    CounterHintPlayer next[2];
    BattleWork *battle = Battle_GetWork();
    BtlMoveChr *chr[2];
    int p;

    if (gPortResim) {
        return;
    }
    Port_CounterHintRead(next);
    for (p = 0; p < 2; p++) {
        next[p].visible = next[p].leadTicks = next[p].inputActive = 0;
    }
    chr[0] = chr[1] = NULL;
    if (battle != NULL && battle->running &&
        !(battle->flags & (BATTLE_FLAG_PAUSE | BATTLE_FLAG_DEMO | BATTLE_FLAG_READY | BATTLE_FLAG_LOADING))) {
        chr[0] = BtlChar_FindBySide(0);
        chr[1] = BtlChar_FindBySide(1);
    }
    for (p = 0; p < 2; p++) {
        BtlMoveChr *def = chr[p], *atk = chr[p ^ 1];
        int success;
        BobjObj *aobj, *dobj;

        if (def == NULL || atk == NULL || cpu_controlled(def)) {
            sWasSuccess[p] = 0;
            memset(&sAttempt[p], 0, sizeof(sAttempt[p]));
            sAttempt[p].lastInputTick = -1;
            continue;
        }
        next[p].visible = 1;
        success = BtlChar_TestFlag(def, 0x7B) || BtlChar_TestPrevFlag(def, 0x7B);
        if (success && !sWasSuccess[p]) {
            next[p].success++;
            feedback(&next[p], COUNTER_RESULT_SUCCESS);
        }
        sWasSuccess[p] = success;
        if (BtlChars_IsTimeStopped()) {
            continue;
        }
        next[p].inputActive = def->unk1070 > 0;
        aobj = BtlChar_GetObj(atk);
        dobj = BtlChar_GetObj(def);
        if (aobj != NULL && dobj != NULL && BtlOpp_GetPlayer(atk) == def->player &&
            !BtlChar_TestFlag(atk, 0x42) && !BtlChar_TestFlag(def, 0x42)) {
            int lead = forecast(atk, def, aobj, dobj);
            /* Retain the opportunity even after a premature input starts the retry cooldown. */
            next[p].leadTicks = def->unk1070 + 31 <= lead ? lead : 0;
            if (!success) {
                judge_attempt(p, &next[p], def, aobj, lead);
            }
        } else {
            sAttempt[p].tracked = 0;
        }
    }
    pthread_mutex_lock(&sLock);
    memcpy(sHint, next, sizeof(sHint));
    pthread_mutex_unlock(&sLock);
}

void Port_CounterHintRead(CounterHintPlayer out[2]) {
    pthread_mutex_lock(&sLock);
    memcpy(out, sHint, sizeof(sHint));
    pthread_mutex_unlock(&sLock);
}
