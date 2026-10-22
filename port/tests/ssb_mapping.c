/* cc -DPORT -Iinclude port/tests/ssb_mapping.c -o /tmp/ssb_mapping && /tmp/ssb_mapping */
#include <assert.h>
#include "port_dlc.h"
static int enabled;
int PortDlc_Enabled(void) { return enabled; }
int main(void) {
    int id, costume, damaged;
    for (enabled = 0; enabled <= 1; enabled++) {
        for (id = 0; id < 167; id++) {
            for (costume = 0; costume < 4; costume++) {
                for (damaged = 0; damaged < 2; damaged++) {
                    int model = PortDlc_Model(id, costume, damaged);
                    assert(PortDlc_ModelCharacter(model) == id);
                    if (!enabled || id < 165)
                        assert(model == 0x590 + id * 10 + costume + damaged * 4);
                    else
                        assert(model == 0xD48 + 100000 + (id - 165) * 26 + damaged * 4);
                }
            }
            if (!enabled || id < 165) {
                assert(PortDlc_Voice(id) == id);
                assert(PortDlc_Animation(id) == 0x598 + id * 10);
                assert(PortDlc_Attacks(id) == 0x599 + id * 10);
                assert(PortDlc_Portrait(id) == 0x2F9 + id);
            }
        }
    }
    enabled = 1;
    assert(PortDlc_Voice(165) == 5 && PortDlc_Voice(166) == 36);
    assert(PortDlc_Hud(166, 1) == 0xD48 + 100047);
    assert(!PortDlc_IsCharacter(164) && !PortDlc_IsCharacter(167));
    return 0;
}
