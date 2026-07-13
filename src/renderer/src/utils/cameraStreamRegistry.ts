let activeStream: MediaStream | null = null

export function setSharedCameraStream(stream: MediaStream | null): void {
  activeStream = stream
}

export function getSharedCameraStream(): MediaStream | null {
  return activeStream
}
