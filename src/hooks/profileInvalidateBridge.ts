// profileInvalidateBridge — emette un evento quando viene aggiunto/rimosso
// un titolo dal profilo, così la ProfilePage in keep-alive può aggiornarsi
// senza smontarsi e rimontarsi.

type Listener = () => void

let listener: Listener | null = null

function emitInvalidate() {
  listener?.()
}

export const profileInvalidateBridge = {
  /** Chiamato dalla ProfilePage per registrarsi */
  register(fn: Listener) {
    listener = fn
  },
  unregister() {
    listener = null
  },
  /** Chiamato da Discover / ForYou / Swipe dopo aver aggiunto un titolo */
  invalidate() {
    emitInvalidate()
  },
  /** Alias legacy usato ancora da alcune pagine vecchie. */
  notify() {
    emitInvalidate()
  },
}
