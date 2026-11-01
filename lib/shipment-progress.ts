import { statusLabel, trackingMilestones, type Shipment } from "./shipments";

function validDate(value?: string) {
  return value && Number.isFinite(new Date(value).getTime()) ? value : undefined;
}

export function shipmentMilestoneDate(shipment: Shipment, stage: string) {
  const current = statusLabel(shipment.status);
  const history = [...(shipment.history ?? [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const matches = (status: Shipment["status"], name: string) => statusLabel(status) === name
    || (name === "In transit" && status === "On The Way")
    || (name === "On hold" && ["Custom Hold", "Customs"].includes(status));
  const recordedDate = (name: string) => validDate(shipment.milestoneDates?.[name])
    || history.find(event => matches(event.status, name) && validDate(event.date))?.date;
  const ownDate = recordedDate(stage);
  if (ownDate) return ownDate;
  const index = trackingMilestones.findIndex(value => value === stage);
  const currentIndex = trackingMilestones.findIndex(value => value === current);
  if (index < 0 || index > currentIndex) return undefined;
  return recordedDate(current) || validDate(shipment.updatedAt) || validDate(shipment.createdAt);
}
