/* Browser adapter for the two standalone SSB slots in game-ssb.iso.
 * Virtual files live beyond both original archives and added stages. */
#ifndef PORT_DLC_H
#define PORT_DLC_H
#ifdef PORT
int PortDlc_Enabled(void);
#else
#define PortDlc_Enabled() 0
#endif
static int PortDlc_IsCharacter(int id) {
    return (id == 165 || id == 166) && PortDlc_Enabled();
}
static int PortDlc_File(int id, int slot, int original) {
    return PortDlc_IsCharacter(id) ? 0xD48 + 100000 + (id - 165) * 26 + slot : original;
}
static int PortDlc_Model(int id, int costume, int damaged) {
    return PortDlc_File(id, damaged ? 4 : 0, 0x590 + id * 10 + costume + (damaged ? 4 : 0));
}
static int PortDlc_Animation(int id) { return PortDlc_File(id, 8, 0x598 + id * 10); }
static int PortDlc_Attacks(int id) { return PortDlc_File(id, 12, 0x599 + id * 10); }
static int PortDlc_Hud(int id, int side) { return PortDlc_File(id, 20 + side, 8 + id * 2 + side); }
static int PortDlc_Portrait(int id) { return PortDlc_File(id, 16, 0x2F9 + id); }
static int PortDlc_Voice(int id) {
    return PortDlc_IsCharacter(id) ? (id == 165 ? 5 : 36) : id;
}
static int PortDlc_ModelCharacter(int file) {
    if (PortDlc_Enabled() && file >= 0xD48 + 100000 && file < 0xD48 + 100052)
        return 165 + (file - 0xD48 - 100000) / 26;
    return (file - 0x590) / 10;
}
#endif
