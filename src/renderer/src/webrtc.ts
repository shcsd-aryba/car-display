export interface PeerEntry {
  clientId: string
  pc: RTCPeerConnection
  stream: MediaStream | null
  remoteDescSet: boolean
  pendingCandidates: RTCIceCandidateInit[]
}

const peers = new Map<string, PeerEntry>()
const MAX_PEERS = 3

let activeSourceId = ''

export function setActiveSource(id: string): void {
  activeSourceId = id
}

export function getActiveSource(): string {
  return activeSourceId
}

// Try multiple getUserMedia constraint formats — Electron 28 / Chrome 120 behaviour
// changed between major versions, so we probe both to be safe.
async function getScreenStream(sourceId: string): Promise<MediaStream> {
  const id = sourceId || activeSourceId
  if (!id) throw new Error('No screen source selected')

  const attempts: MediaStreamConstraints[] = [
    // Modern format (Chrome 72+, preferred)
    {
      audio: false,
      // @ts-expect-error — Electron-specific constraint
      video: { chromeMediaSource: 'desktop', chromeMediaSourceId: id }
    },
    // Legacy mandatory format (older Electron/Chrome)
    {
      audio: false,
      video: {
        // @ts-expect-error — Electron-specific constraint
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: id,
          maxWidth: 1920,
          maxHeight: 1080,
          maxFrameRate: 30
        }
      }
    }
  ]

  let lastErr: unknown
  for (const constraint of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraint)
    } catch (err) {
      lastErr = err
      console.warn('[webrtc] getUserMedia attempt failed:', err)
    }
  }
  throw lastErr
}

export async function handleOffer(
  clientId: string,
  sdp: RTCSessionDescriptionInit,
  sourceId: string
): Promise<void> {
  if (peers.size >= MAX_PEERS) {
    console.warn('[webrtc] max peers reached, ignoring offer from', clientId)
    return
  }

  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  })

  const entry: PeerEntry = {
    clientId,
    pc,
    stream: null,
    remoteDescSet: false,
    pendingCandidates: []
  }
  peers.set(clientId, entry)

  pc.onicecandidate = (e) => {
    if (e.candidate) window.electronAPI.sendIce(clientId, e.candidate.toJSON())
  }

  pc.onconnectionstatechange = () => {
    console.log(`[webrtc] ${clientId} state: ${pc.connectionState}`)
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
      removePeer(clientId)
    }
  }

  try {
    const sid = sourceId || activeSourceId
    console.log(`[webrtc] capturing screen, sourceId=${sid}`)
    const stream = await getScreenStream(sid)
    console.log(`[webrtc] screen captured OK, tracks=${stream.getTracks().length}`)
    entry.stream = stream
    stream.getTracks().forEach((track) => pc.addTrack(track, stream))

    await pc.setRemoteDescription(new RTCSessionDescription(sdp))
    entry.remoteDescSet = true
    console.log(`[webrtc] remote desc set, draining ${entry.pendingCandidates.length} queued ICE`)

    for (const candidate of entry.pendingCandidates) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.warn)
    }
    entry.pendingCandidates = []

    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    console.log(`[webrtc] answer sent to ${clientId.slice(0, 8)}`)
    window.electronAPI.sendAnswer(clientId, answer)
  } catch (err) {
    console.error('[webrtc] handleOffer failed:', err)
    removePeer(clientId)
    throw err  // re-throw so App.tsx can show the error
  }
}

// Replace the live video track for an already-connected peer.
// Throws if the peer doesn't exist or has no active sender.
export async function replaceStream(clientId: string, sourceId: string): Promise<void> {
  const entry = peers.get(clientId)
  if (!entry) throw new Error('NO_PEER')

  const newStream = await getScreenStream(sourceId)
  const newTrack = newStream.getVideoTracks()[0]
  if (!newTrack) throw new Error('No video track in new stream')

  const sender = entry.pc.getSenders().find((s) => s.track?.kind === 'video')
  if (!sender) throw new Error('NO_SENDER')

  await sender.replaceTrack(newTrack)
  entry.stream?.getTracks().forEach((t) => t.stop())
  entry.stream = newStream
}

export function handleIceFromBrowser(
  clientId: string,
  candidate: RTCIceCandidateInit
): void {
  // Empty string = end-of-candidates signal; .local = mDNS hostname unresolvable on Windows
  if (!candidate.candidate || candidate.candidate.includes('.local')) return

  const entry = peers.get(clientId)
  if (!entry) return

  if (!entry.remoteDescSet) {
    entry.pendingCandidates.push(candidate)
    return
  }

  entry.pc.addIceCandidate(new RTCIceCandidate(candidate)).catch((err) => {
    console.warn('[webrtc] addIceCandidate error:', err)
  })
}

export function removePeer(clientId: string): void {
  const entry = peers.get(clientId)
  if (!entry) return
  entry.stream?.getTracks().forEach((t) => t.stop())
  entry.pc.close()
  peers.delete(clientId)
}

export function getPeerCount(): number {
  return peers.size
}
