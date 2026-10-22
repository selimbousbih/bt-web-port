/* Read-only training overlay. Sample on the game thread; copy on the render thread. */
#ifndef PORT_COUNTER_HINT_H
#define PORT_COUNTER_HINT_H
#ifdef __cplusplus
extern "C" {
#endif

#define COUNTER_HINT_LEAD_TICKS 6
enum CounterHintResult {
    COUNTER_RESULT_NONE, COUNTER_RESULT_SUCCESS, COUNTER_RESULT_EARLY, COUNTER_RESULT_LATE,
    COUNTER_RESULT_TOGETHER, COUNTER_RESULT_NOT_READY, COUNTER_RESULT_MISSED
};
typedef struct CounterHintPlayer {
    int visible;       /* a human-controlled fighter in an active battle */
    int leadTicks;     /* 1: next update; 2..6: early warning; 0: no prediction */
    int inputActive;   /* the game's own counter timer is positive */
    unsigned success;  /* monotonic event number, only from confirmed counters */
    unsigned resultSerial;
    int result;        /* CounterHintResult; timing verdicts use the animation estimate */
} CounterHintPlayer;

/* Wall-clock lifetime, independent of simulation speed and interpolated render count. */
typedef struct CounterHintFeedback {
    unsigned serial;
    int result;
    unsigned long long until;
} CounterHintFeedback;

static inline int CounterHint_FeedbackUpdate(CounterHintFeedback *f, const CounterHintPlayer *h,
                                             int enabled, unsigned long long now) {
    if (!enabled || !h->visible) {
        f->until = 0;
    } else if (h->resultSerial != f->serial) {
        f->result = h->result;
        f->until = now + (h->result == COUNTER_RESULT_SUCCESS ? 650 : 2000);
    }
    f->serial = h->resultSerial;
    return enabled && h->visible && now < f->until ? f->result : COUNTER_RESULT_NONE;
}

void Port_CounterHintSample(void);
void Port_CounterHintRead(CounterHintPlayer out[2]);

#ifdef __cplusplus
}
#endif
#endif
