export type ChannelOption = {
  id: string
  label: string
  delaySeconds: number
}

export const channels = [
  { id: "zigueira-60", label: "ziGueira", delaySeconds: 60 },
  { id: "alanzoka-15", label: "Alanzoka", delaySeconds: 15 },
  { id: "gaules-30", label: "Gaules", delaySeconds: 30 },
  { id: "casimito-45", label: "Casimito", delaySeconds: 45 },
  { id: "cellbit-90", label: "Cellbit", delaySeconds: 90 },
] satisfies ChannelOption[]

export function findChannel(channelId: string): ChannelOption | undefined {
  return channels.find((channel) => channel.id === channelId)
}
