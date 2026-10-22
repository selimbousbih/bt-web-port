#include <stdlib.h>
#ifdef __EMSCRIPTEN__
extern int Web_SsbDlcEnabled(void);
#endif
/* Browsers recognize the archive after runtime initialization, when libc's
 * environment may already be cached. Read that recognition result directly. */
int PortDlc_Enabled(void) {
#ifdef __EMSCRIPTEN__
    int browser = Web_SsbDlcEnabled();
    if (browser >= 0) return browser;
#endif
    {
        const char *value = getenv("BT3_SSB_DLC");
        return value != NULL && value[0] == '1';
    }
}
