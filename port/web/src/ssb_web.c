#include <emscripten.h>
/* -1 in the Node test build, which uses extracted files and its environment. */
EM_JS(int, Web_SsbDlcEnabled, (void), {
    return typeof Module.webSsbDlc === 'boolean' ? (Module.webSsbDlc ? 1 : 0) : -1;
});
