/* Observe a battle once at its start and on leaving the fight state, before the
 * result menu can overwrite its winner/reason for a rematch or replay. */
#include <emscripten.h>
#include "port_compat.h" /* PS2 long/u64 are 64 bits, including on wasm32. */
#include "battle/battle.h"
#include <stddef.h>

_Static_assert(sizeof(BattleSide) == 0x270, "BattleSide layout must match the game");
_Static_assert(offsetof(BattleResult, frames) == 0x18, "BattleResult layout must match the game");

extern int BattleReplay_IsActive(void);

EM_JS(void, web_results_start, (int mode, int cpu0, int cpu1, int pad0, int pad1), {
    if (typeof window !== 'undefined' && window.BT3Results) window.BT3Results.start({gameMode: mode, cpu: [!!cpu0, !!cpu1], pads: [pad0, pad1]});
});
EM_JS(void, web_results_finish, (int flags, int reason, int frames), {
    if (typeof window !== 'undefined' && window.BT3Results) window.BT3Results.finish(flags, reason, frames);
});

void Web_ResultsStart(void) {
    BattleSetup *setup = Battle_GetSetup();
    int mode = setup->rule.mode;
    /* Replays, attract demos and practice are not new played matches. */
    if (BattleReplay_IsActive() || mode == BTL_MODE_DEMO || mode == BTL_MODE_TRAINING) mode = -1;
    web_results_start(mode, setup->sides[0].control != BTL_CONTROL_PAD,
                      setup->sides[1].control != BTL_CONTROL_PAD,
                      setup->sides[0].pad, setup->sides[1].pad);
}

void Web_ResultsFinish(void) {
    BattleResult *result = Battle_GetResult();
    web_results_finish(result->winner, result->reason, result->frames);
}
