import { collection, deleteDoc, doc, getDocsFromServer, onSnapshot, orderBy, query, runTransaction, setDoc } from "firebase/firestore";
import { db } from "@/utils/firebase/client";

export type ShipmentStatus = "Booked" | "In transit" | "On hold" | "Customs" | "Delivered" | "Order Confirmed" | "Picked by Courier" | "On The Way" | "Custom Hold";
export type ShipmentEvent = { id: string; date: string; status: ShipmentStatus; location: string; description: string; source?: "automatic"; recordedBy?: string };
export type RouteStop = { id: string; label: string; latitude: number; longitude: number; kind: "origin" | "stop" | "current" | "destination" };
export type Shipment = {
  id: string; trackingCode: string; customerName: string; customerEmail: string;
  cargoDescription: string; origin: string; destination: string; location: string;
  status: ShipmentStatus; eta: string; progress: number; photoUrl?: string; photoPath?: string;
  createdBy: string; createdByRole?: "Super admin" | "Admin"; createdAt: string; updatedAt: string;
  note?: string;
  senderName?: string; senderAddress?: string; senderPhone?: string; senderEmail?: string;
  receiverAddress?: string; receiverPhone?: string;
  weight?: string; shipmentType?: string; shippedAt?: string; pickupAt?: string; deliveryMode?: string;
  dutyFees?: string; feeName?: string; clearanceFee?: string; currency?: string; verified?: boolean; estimatedDistance?: string; supportEmail?: string;
  history?: ShipmentEvent[]; routeStops?: RouteStop[];
  milestoneDates?: Record<string, string>;
};

export const SHIPMENTS_COLLECTION = "shipments";
export const shipmentStatuses: ShipmentStatus[] = ["Order Confirmed", "Picked by Courier", "In transit", "On hold", "Delivered", "Booked"];
export const trackingMilestones = ["Order Confirmed", "Picked by Courier", "In transit", "On hold", "Delivered"] as const;
export function statusLabel(status: ShipmentStatus) {
  return ({ Booked: "Order Confirmed", "On The Way": "In transit", "Custom Hold": "On hold", Customs: "On hold" } as Partial<Record<ShipmentStatus, string>>)[status] ?? status;
}
// Kept for existing UI messages. A successful operation now always means Firestore acknowledged it.
export function shipmentStorageNotice() { return ""; }

async function cloudOperation<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Firebase did not confirm this operation. Refresh to check its status before trying again.")), 15000);
    })]);
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "permission-denied") {
      throw new Error("Firebase denied access to shipments. The project's Firestore permissions must allow this app before records can be saved or loaded.");
    }
    if (typeof error === "object" && error && "code" in error && error.code === "unavailable") {
      throw new Error("Firebase is unavailable. This operation was not confirmed. Check your connection and refresh before retrying.");
    }
    throw error;
  } finally { if (timer) clearTimeout(timer); }
}

export function generateTrackingCode() {
  return `BC-${new Date().getFullYear()}-${crypto.randomUUID().replaceAll("-", "").slice(0,12).toUpperCase()}`;
}
export function progressForStatus(status: ShipmentStatus) {
  return { Booked: 18, "Order Confirmed": 18, "Picked by Courier": 35, "In transit": 55, "On The Way": 55, "On hold": 55, Customs: 55, "Custom Hold": 55, Delivered: 100 }[status];
}
export async function readShipments() {
  const snapshot = await cloudOperation(getDocsFromServer(query(collection(db, SHIPMENTS_COLLECTION), orderBy("createdAt", "desc"))));
  return snapshot.docs.map(item => item.data() as Shipment);
}
export function watchShipment(id: string, onChange: (shipment: Shipment | null) => void, onError: () => void) {
  return onSnapshot(doc(db, SHIPMENTS_COLLECTION, id), snapshot => {
    if (snapshot.metadata.hasPendingWrites) return;
    onChange(snapshot.exists() ? snapshot.data() as Shipment : null);
  }, onError);
}
export async function saveShipment(shipment: Shipment, currentShipments: Shipment[] = []) {
  const saved = {
    ...shipment,
    milestoneDates: { [statusLabel(shipment.status)]: shipment.createdAt, ...shipment.milestoneDates },
    history: [activityEvent(shipment, "Shipment created and tracking number assigned.", shipment.createdAt), ...(shipment.history ?? [])],
  };
  await cloudOperation(setDoc(doc(db, SHIPMENTS_COLLECTION, shipment.id), saved));
  return [saved, ...currentShipments.filter(item => item.id !== shipment.id)];
}

function activityEvent(shipment: Shipment, description: string, date: string): ShipmentEvent {
  let recordedBy = shipment.createdBy;
  try { recordedBy = window.localStorage.getItem("bluecrest-logistics-admin-session") || recordedBy; } catch { /* Non-browser callers use the shipment owner. */ }
  return { id: crypto.randomUUID(), date, status: shipment.status, location: shipment.location, description, source: "automatic", recordedBy };
}

const activityLabels: Partial<Record<keyof Shipment, string>> = {
  customerName: "Receiver name", customerEmail: "Receiver email", receiverAddress: "Receiver address", receiverPhone: "Receiver phone",
  senderName: "Sender name", senderAddress: "Sender address", senderPhone: "Sender phone", senderEmail: "Sender email",
  cargoDescription: "Cargo description", origin: "Departure location", destination: "Destination", eta: "Expected delivery",
  weight: "Weight", shipmentType: "Shipment type", shippedAt: "Shipped date", pickupAt: "Pickup date", deliveryMode: "Delivery mode",
  dutyFees: "Duty fees", feeName: "Fee name", clearanceFee: "Fee amount", currency: "Currency", verified: "Verification badge", estimatedDistance: "Estimated distance",
  supportEmail: "Payment support contact", note: "Tracking note", routeStops: "Shipment route", milestoneDates: "Progress milestone dates", history: "Shipment history",
};

export async function updateShipmentRecord(id: string, updates: Partial<Shipment>, currentShipments: Shipment[]) {
  const reference = doc(db, SHIPMENTS_COLLECTION, id);
  const saved = await cloudOperation(runTransaction(db, async transaction => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new Error("This shipment no longer exists. Refresh the records.");
    const previous = snapshot.data() as Shipment;
    const changed = (key: keyof Shipment) => key in updates && JSON.stringify(updates[key]) !== JSON.stringify(previous[key]);
    const descriptions: string[] = [];
    if (changed("trackingCode")) descriptions.push(`Tracking number changed from ${previous.trackingCode} to ${updates.trackingCode}.`);
    if (changed("status")) descriptions.push(`Status updated to ${statusLabel(updates.status!)}.`);
    if (changed("location")) descriptions.push(`Location updated to ${updates.location || "not provided"}.`);
    if (changed("photoUrl")) descriptions.push(updates.photoUrl ? "Shipment photo updated." : "Shipment photo removed.");
    const fields = (Object.keys(activityLabels) as (keyof Shipment)[]).filter(changed).map(key => activityLabels[key]);
    if (fields.length) descriptions.push(`${fields.join(", ")} updated.`);
    if (!descriptions.length && changed("updatedAt")) descriptions.push("Shipment record timestamp updated.");
    const now = new Date().toISOString();
    const patch = { ...updates, updatedAt: updates.updatedAt || now, ...(updates.status ? { progress: progressForStatus(updates.status) } : {}) };
    const next = { ...previous, ...patch };
    if (changed("status")) {
      const milestone = statusLabel(next.status);
      next.milestoneDates = { ...next.milestoneDates };
      // Respect explicitly entered dates; otherwise record when the status was reached.
      if (!Object.prototype.hasOwnProperty.call(updates.milestoneDates ?? {}, milestone)) next.milestoneDates[milestone] = now;
    }
    if (descriptions.length) next.history = [...(next.history ?? []), activityEvent(next, descriptions.join(" "), now)];
    transaction.update(reference, { ...patch, ...(next.history ? { history: next.history } : {}), ...(next.milestoneDates ? { milestoneDates: next.milestoneDates } : {}) });
    return next;
  }));
  return currentShipments.map(item => item.id === id ? saved : item);
}
export async function deleteShipmentRecord(id: string, currentShipments: Shipment[]) {
  await cloudOperation(deleteDoc(doc(db, SHIPMENTS_COLLECTION, id)));
  return currentShipments.filter(item => item.id !== id);
}
export function findShipment(reference: string, shipments: Shipment[]) {
  const normalized = reference.trim().toLowerCase();
  return normalized ? shipments.find(item => item.trackingCode.toLowerCase() === normalized || item.id.toLowerCase() === normalized) ?? null : null;
}
