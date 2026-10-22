/* cc -std=c11 -Iinclude -Iport/include -Iport/src port/tests/counter_hint.c -o /tmp/bt3-counter-hint && /tmp/bt3-counter-hint
 * Exercise the read-only coach against synthetic animation timelines and fighter states. */
#include <assert.h>
#include <stdio.h>
/* Host tests do not participate in the ELF/Wasm rollback-state layout. */
#define PORT_HOST_H
#define PORT_HOST
#include "../src/plat_counter_hint.c"

static BattleWork battle;
static BtlMoveChr fighters[2];
static BobjObj objects[2];
static struct { BobjAnim head; BobjAnimEvent extra[2]; } motion;
static int freeFighter = 1, stopped, counter, prevCounter, attack = 0, canCounter = 1;
static float facing;
static int tick = 100;
static unsigned pressed, held;
int gPortResim;
int BtlChar_GetFrame(void) { return tick; }
int BtlInput_IsPressed(void *c, unsigned mask) { return c == &fighters[0] && (pressed & mask) != 0; }
int BtlInput_IsHeld(void *c, unsigned mask) { return c == &fighters[0] && (held & mask) != 0; }
BattleWork *Battle_GetWork(void) { return &battle; }
void *BtlChar_FindBySide(int p) { return &fighters[p]; }
BobjObj *BtlChar_GetObj(void *c) { return &objects[((BtlMoveChr *)c)->player]; }
int BtlChar_TestFlag(void *c, int bit) { return c == &fighters[0] && bit == 0x7B && counter; }
int BtlChar_TestPrevFlag(void *c, int bit) { return c == &fighters[0] && bit == 0x7B && prevCounter; }
int BtlChar_IsFree(void *c) { (void)c; return freeFighter; }
int BtlChars_IsTimeStopped(void) { return stopped; }
int BtlAnim_GetId(void *c) { (void)c; return 0; }
unsigned BtlAnim_GetFlags(int a) { (void)a; return canCounter ? 0x31 : 0; }
int BtlAtk_GetId(void *c) { (void)c; return attack; }
unsigned BtlAtk_GetFlags(void *c) { (void)c; return 0; }
float BtlOpp_GetYawFromFacing(void *c) { (void)c; return facing; }
int BtlOpp_GetPlayer(void *c) { return ((BtlMoveChr *)c)->player ^ 1; }

static CounterHintPlayer sample(void) {
    CounterHintPlayer out[2];
    tick++;
    Port_CounterHintSample();
    Port_CounterHintRead(out);
    return out[0];
}

int main(void) {
    CounterHintPlayer h;
    BtlMoveChr before[2];
    BobjObj objectsBefore[2];
    int p, inject = 1;
    battle.running = 1;
    for (p = 0; p < 2; p++) {
        fighters[p].player = p;
        fighters[p].side = p;
        fighters[p].objId = p + 4; /* Object allocation order must not decide which side receives the coach. */
        fighters[p].unk1070 = -30;
        objects[p].anim.layer[0].data = &motion.head;
        objects[p].anim.step = 2;
        objects[p].body.radius = 10;
        objects[p].body.size[0] = 20;
    }
    motion.head.eventCount = 2;
    motion.head.event[0].attrLo = BOBJ_EV_HIT_BEGIN;
    motion.head.event[0].frame = 12;
    motion.head.event[0].arg = 1;
    motion.extra[0] = motion.head.event[0];
    motion.extra[0].frame = 20; /* A later hit must never produce another first-hit counter cue. */
    memcpy(before, fighters, sizeof(before));
    memcpy(objectsBefore, objects, sizeof(objectsBefore));
    h = sample();
    assert(h.visible && h.leadTicks == 6);
    assert(memcmp(before, fighters, sizeof(before)) == 0);
    assert(memcmp(objectsBefore, objects, sizeof(objectsBefore)) == 0);
    objects[1].anim.frame = 10;
    assert(sample().leadTicks == 1); /* shown before the next input sample, not after the hit */
    objects[1].anim.frame = 12;
    assert(sample().leadTicks == 0);
    objects[1].anim.frame = 18;
    assert(sample().leadTicks == 0);
    objects[1].anim.frame = 10;
    fighters[0].unk1070 = -29;
    assert(sample().leadTicks == 0); /* cannot re-arm on the next update */
    objects[1].anim.frame = 8;
    assert(sample().leadTicks == 2); /* cooldown ready by the forecast update */
    fighters[0].unk1070 = -30;
    objects[1].anim.step = 0;
    assert(sample().leadTicks == 0);
    objects[1].anim.step = 1;
    assert(sample().leadTicks == 4);
    objects[1].anim.step = 2;
    objects[1].anim.frame = 10;
    freeFighter = 0;
    assert(sample().leadTicks == 0);
    freeFighter = 1;
    canCounter = 0;
    assert(sample().leadTicks == 0);
    canCounter = 1;
    facing = 2;
    assert(sample().leadTicks == 0);
    facing = 0;
    fighters[1].pose.pos.x = 1000;
    assert(sample().leadTicks == 0);
    fighters[1].pose.pos.x = 0;
    attack = -1;
    assert(sample().leadTicks == 0);
    attack = 0;
    fighters[0].unk1070 = 1;
    assert(sample().inputActive);
    stopped = 1;
    h = sample();
    assert(!h.leadTicks && !h.inputActive);
    counter = 1;
    h = sample();
    assert(h.success == 1); /* real counter confirmation still appears during its hit-stop */
    assert(sample().success == 1);
    counter = 0; prevCounter = 1;
    assert(sample().success == 1);
    prevCounter = 0;
    sample();
    counter = 1;
    assert(sample().success == 2);
    stopped = counter = 0;
    battle.flags = BATTLE_FLAG_PAUSE;
    assert(!sample().visible);
    battle.flags = BATTLE_FLAG_DEMO;
    assert(!sample().visible);
    battle.flags = BATTLE_FLAG_LOADING;
    assert(!sample().visible);
    battle.flags = BATTLE_FLAG_READY;
    assert(!sample().visible);
    battle.flags = 0;
    memcpy((unsigned char *)&fighters[0] + 0x1278, &inject, sizeof(inject));
    assert(!sample().visible);
    inject = 0;
    memcpy((unsigned char *)&fighters[0] + 0x1278, &inject, sizeof(inject));
    fighters[0].unk1070 = -30;
    h = sample();
    assert(h.leadTicks == 1);
    gPortResim = 1;
    objects[1].anim.frame = 12;
    assert(sample().leadTicks == h.leadTicks); /* rollback frames do not reach the visible coach */
    gPortResim = 0;
    battle.running = 0;
    assert(!sample().visible);

    /* Attempts are classified relative to the input update's animation interval, including late attempts
       after the defender has entered a hit reaction and no longer passes the forecast's eligibility gate. */
    battle.running = 1;
    objects[1].anim.frame = 8;
    objects[1].anim.prevFrame = 6;
    fighters[0].unk1070 = -30;
    sample();
    pressed = held = 0x18;
    fighters[0].unk1070 = 1;
    h = sample();
    assert(h.result == COUNTER_RESULT_EARLY);
    {
        CounterHintPlayer out[2];
        Port_CounterHintSample(); /* multiple draws of the same input do not generate another verdict */
        Port_CounterHintRead(out);
        assert(out[0].resultSerial == h.resultSerial);
    }
    pressed = held = 0;
    objects[1].anim.frame = 12;
    objects[1].anim.prevFrame = 10;
    sample();
    objects[1].anim.frame = 14;
    objects[1].anim.prevFrame = 12;
    freeFighter = 0;
    pressed = held = 0x18;
    h = sample();
    assert(h.result == COUNTER_RESULT_LATE);
    pressed = 0x08; held = 0x18;
    assert(sample().result == COUNTER_RESULT_TOGETHER);
    pressed = held = 0x08;
    assert(sample().resultSerial == h.resultSerial + 1); /* an ordinary Square press is not an attempt */
    freeFighter = 1;
    pressed = held = 0;
    objects[1].anim.frame = 8;
    objects[1].anim.prevFrame = 6;
    sample();
    objects[1].anim.frame = 12;
    objects[1].anim.prevFrame = 10;
    pressed = held = 0x18;
    assert(sample().result == COUNTER_RESULT_MISSED); /* no invented early/late verdict at activation */
    fighters[0].unk1070 = -1;
    assert(sample().result == COUNTER_RESULT_NOT_READY);
    counter = 1;
    h = sample();
    assert(h.result == COUNTER_RESULT_SUCCESS);
    assert(sample().resultSerial == h.resultSerial);
    counter = 0;
    pressed = held = 0;
    objects[1].anim.frame = 8;
    sample();
    objects[1].anim.layer[0].id++;
    objects[1].anim.frame = 14;
    pressed = held = 0x18;
    assert(sample().resultSerial == h.resultSerial); /* cancelled/replaced attacks have no late verdict */

    /* Two real seconds, even with repeated rendering or a slow/frozen simulation. */
    {
        CounterHintFeedback f = {0};
        CounterHintPlayer event = {0};
        event.visible = 1; event.resultSerial = 1; event.result = COUNTER_RESULT_EARLY;
        assert(CounterHint_FeedbackUpdate(&f, &event, 1, 100) == COUNTER_RESULT_EARLY);
        assert(f.until == 2100);
        assert(CounterHint_FeedbackUpdate(&f, &event, 1, 2099) == COUNTER_RESULT_EARLY);
        assert(f.until == 2100); /* redraws never restart the two seconds */
        assert(CounterHint_FeedbackUpdate(&f, &event, 1, 2100) == COUNTER_RESULT_NONE);
        event.resultSerial++; event.result = COUNTER_RESULT_LATE;
        assert(CounterHint_FeedbackUpdate(&f, &event, 1, 2200) == COUNTER_RESULT_LATE);
        assert(f.until == 4200);
        event.resultSerial++; event.result = COUNTER_RESULT_SUCCESS;
        assert(CounterHint_FeedbackUpdate(&f, &event, 1, 2300) == COUNTER_RESULT_SUCCESS);
        assert(f.until == 2950); /* real success replaces failure immediately */
        assert(CounterHint_FeedbackUpdate(&f, &event, 0, 2400) == COUNTER_RESULT_NONE);
        assert(CounterHint_FeedbackUpdate(&f, &event, 1, 2500) == COUNTER_RESULT_NONE);
        event.resultSerial++; event.result = COUNTER_RESULT_LATE;
        CounterHint_FeedbackUpdate(&f, &event, 1, 2600);
        event.visible = 0;
        assert(CounterHint_FeedbackUpdate(&f, &event, 1, 2700) == COUNTER_RESULT_NONE);
    }
    puts("counter hint checks passed");
    return 0;
}
