/* Rate-coded KC core, one integration step. Matches trainer/brain-ref.js computeKC. */
#include <stdint.h>

#define N_KC 5177
#define FANIN 7

static const float *syn;
static const uint16_t *edges;
static float theta;
static uint8_t kc[N_KC];
static float rate[N_KC];
static uint16_t fired[N_KC];
static uint16_t n_fired;

void brain_set(const uint16_t *e, const float *s, float th) {
  edges = e;
  syn = s;
  theta = th;
}

uint16_t brain_forward(const float *pn) {
  uint16_t n = 0;
  for (uint16_t k = 0; k < N_KC; k++) {
    const uint32_t b = (uint32_t)k * FANIN;
    float sum = 0.f;
    for (int j = 0; j < FANIN; j++) sum += syn[b + j] * pn[edges[b + j]];
    if (sum >= theta) {
      kc[k] = 1;
      rate[k] = (sum - theta) / 120.f + 0.2f;
      fired[n++] = k;
    } else {
      kc[k] = 0;
      rate[k] = 0.f;
    }
  }
  n_fired = n;
  return n;
}

uint16_t brain_n_fired(void) { return n_fired; }
const uint8_t *brain_kc(void) { return kc; }
const float *brain_rate(void) { return rate; }
const uint16_t *brain_fired(void) { return fired; }
