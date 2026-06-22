// useEventSocket — manages one WS connection to the statesync /stream/:eventid.
//
// Lifecycle, all field/action names sourced from the contract:
//   1. open WS to `${WS_BASE}/stream/<eventid>`
//   2. FIRST message sent MUST be { token: "<jwt>" } (first-message auth)
//   3. server replies with { type: "INIT", ... }  -> onInit(payload)
//   4. client sends LOCK requests, correlated to acks by `reqid`
//   5. pubsub deltas update local state           -> onDelta(payload)
//   6. graceful close: send { reqid, action: "DONE" } then close
//   7. on unmount WITHOUT a prior DONE -> just close (server treats as
//      abandonment and releases the holds)
import { useCallback, useEffect, useRef, useState } from 'react'
import { C, resolvePath, wsBaseUrl } from '../contract'
import { getToken } from '../auth/auth'

const F = C.wsEnvelope
const ACT = C.clientActions

let reqCounter = 0
function nextReqId() {
  reqCounter += 1
  return `r${Date.now()}-${reqCounter}`
}

export const SocketState = {
  CONNECTING: 'connecting',
  OPEN: 'open',
  CLOSED: 'closed',
  ERROR: 'error',
}

export function useEventSocket({ eventId, onInit, onDelta, enabled = true }) {
  const [status, setStatus] = useState(SocketState.CONNECTING)
  const [error, setError] = useState(null)

  const wsRef = useRef(null)
  const pendingRef = useRef(new Map()) // reqid -> { resolve, reject }
  const doneRef = useRef(false) // true once DONE handshake completed
  const initRef = useRef(onInit)
  const deltaRef = useRef(onDelta)

  // keep latest callbacks without retriggering the connect effect
  initRef.current = onInit
  deltaRef.current = onDelta

  useEffect(() => {
    if (!enabled || !eventId) return undefined

    const path = resolvePath(C.wsStreamPath, { eventid: eventId })
    const url = wsBaseUrl() + path
    const ws = new WebSocket(url)
    wsRef.current = ws
    doneRef.current = false
    setStatus(SocketState.CONNECTING)

    ws.onopen = () => {
      // FIRST message MUST be the token (first-message auth, 10s server timeout).
      ws.send(JSON.stringify({ [F.token]: getToken() }))
      setStatus(SocketState.OPEN)
    }

    ws.onmessage = (ev) => {
      let msg
      try {
        msg = JSON.parse(ev.data)
      } catch {
        return
      }

      // INIT frame
      if (msg[F.type] === C.serverTypes.INIT) {
        if (initRef.current) initRef.current(msg)
        return
      }

      // Ack frame (correlated by reqid)
      if (msg[F.reqid] !== undefined && pendingRef.current.has(msg[F.reqid])) {
        const { resolve } = pendingRef.current.get(msg[F.reqid])
        pendingRef.current.delete(msg[F.reqid])
        resolve(msg)
        return
      }

      // Otherwise a pubsub delta (seat_map: {seat_num,new_status};
      // general: {avlbl,book} or {avlbl_delta})
      if (deltaRef.current) deltaRef.current(msg)
    }

    ws.onerror = () => {
      setStatus(SocketState.ERROR)
      setError(C.messages.wsClosed)
    }

    ws.onclose = () => {
      setStatus(SocketState.CLOSED)
      // reject anything still outstanding
      pendingRef.current.forEach(({ reject }) =>
        reject(new Error(C.messages.wsClosed))
      )
      pendingRef.current.clear()
    }

    return () => {
      // Unmount: if we never sent DONE, this is an abandonment — just close.
      // The server releases held locks on a non-graceful disconnect.
      try {
        if (
          ws.readyState === WebSocket.OPEN ||
          ws.readyState === WebSocket.CONNECTING
        ) {
          ws.close()
        }
      } catch {
        /* ignore */
      }
      wsRef.current = null
    }
  }, [eventId, enabled])

  // Send a request that expects an ack with the same reqid. Returns a promise.
  const sendRequest = useCallback((payload) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(C.messages.wsClosed))
    }
    const reqid = nextReqId()
    const frame = { [F.reqid]: reqid, ...payload }
    return new Promise((resolve, reject) => {
      pendingRef.current.set(reqid, { resolve, reject })
      ws.send(JSON.stringify(frame))
    })
  }, [])

  // seat_map: lock one or more seats. Returns the ack { success, failed_seats }.
  const lockSeats = useCallback(
    (seatNums) =>
      sendRequest({ [F.action]: ACT.LOCK, [F.seatNum]: seatNums }),
    [sendRequest]
  )

  // seat_map: manual unlock.
  const unlockSeats = useCallback(
    (seatNums) =>
      sendRequest({ [F.action]: ACT.UNLOCK, [F.seatNum]: seatNums }),
    [sendRequest]
  )

  // general: lock N seats. Returns the ack { success, avlbl }.
  const lockCount = useCallback(
    (numSeats) =>
      sendRequest({ [F.action]: ACT.LOCK, [F.numSeats]: numSeats }),
    [sendRequest]
  )

  // Graceful close: send DONE, mark released, then close the socket.
  const finishAndClose = useCallback(() => {
    const ws = wsRef.current
    return new Promise((resolve) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        doneRef.current = true
        resolve()
        return
      }
      try {
        ws.send(JSON.stringify({ [F.reqid]: nextReqId(), [F.action]: ACT.DONE }))
      } catch {
        /* ignore */
      }
      doneRef.current = true
      // give the frame a tick to flush, then close
      setTimeout(() => {
        try {
          ws.close()
        } catch {
          /* ignore */
        }
        resolve()
      }, 50)
    })
  }, [])

  return {
    status,
    error,
    lockSeats,
    unlockSeats,
    lockCount,
    finishAndClose,
    sendRequest,
  }
}

export default useEventSocket
