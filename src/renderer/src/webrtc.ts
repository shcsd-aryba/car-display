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

async function getScreenStream(sourceId: string): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      // @ts-expect-error — Electron-specific constraint
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sourceId,
        maxWidth: 1920,
        maxHeight: 1080,
        maxFrameRate: 30
      }
    }
  })
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
    if (e.candidate) {
      window.electronAPI.sendIce(clientId, e.candidate.toJSON())
    }
  }

  pc.onconnectionstatechange = () => {
    console.log(`[webrtc] ${clientId} state: ${pc.connectionState}`)
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
      removePeer(clientId)
    }
  }

  try {
    const stream = await getScreenStream(sourceId || activeSourceId)
    entry.stream = stream

    stream.getTracks().forEach((track) => pc.addTrack(track, stream))

    await pc.setRemoteDescription(new RTCSessionDescription(sdp))
    entry.remoteDescSet = true

    // Drain queued candidates that arrived before remote description was set
    for (const candidate of entry.pendingCandidates) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.warn)
    }
    entry.pendingCandidates = []

    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    window.electronAPI.sendAnswer(clientId, answer)
  } catch (err) {
    console.error('[webrtc] failed to handle offer:', err)
    removePeer(clientId)
  }
}

// Replace the video track for an already-connected peer (source change)
export async function replaceStream(clientId: string, sourceId: string): Promise<void> {
  const entry = peers.get(clientId)
  if (!entry) return

  const newStream = await getScreenStream(sourceId)
  const newTrack = newStream.getVideoTracks()[0]
  if (!newTrack) return

  const sender = entry.pc.getSenders().find((s) => s.track?.kind === 'video')
  if (sender) {
    await sender.replaceTrack(newTrack)
    entry.stream?.getTracks().forEach((t) => t.stop())
    entry.stream = newStream
  }
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
