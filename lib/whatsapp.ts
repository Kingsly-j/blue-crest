import type { Shipment } from "./shipments";

export const WHATSAPP_NUMBER = "19152019157";
export const WHATSAPP_DISPLAY_NUMBER = "+1 (915) 201-9157";

export function whatsappLink(message = "Hello, I need help with my shipment.") {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export function shipmentPaymentLink(shipment: Shipment, feeName: string, formattedAmount: string) {
  return whatsappLink(shipmentPaymentMessage(shipment, feeName, formattedAmount));
}

export function shipmentPaymentEmailLink(shipment: Shipment, feeName: string, formattedAmount: string) {
  const subject = `Payment for ${feeName} - ${shipment.trackingCode}`;
  return `mailto:support@bluecrestshipping.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(shipmentPaymentMessage(shipment, feeName, formattedAmount))}`;
}

function shipmentPaymentMessage(shipment: Shipment, feeName: string, formattedAmount: string) {
  const value = (text?: string) => text?.trim() || "Not provided";
  return [
    `Hello, I would like to arrange payment for ${feeName}.`,
    `Tracking number: ${shipment.trackingCode}`,
    `Fee: ${feeName}`,
    `Amount: ${formattedAmount}`,
    `Receiver: ${value(shipment.customerName)}`,
    `Receiver email: ${value(shipment.customerEmail)}`,
    `Receiver phone: ${value(shipment.receiverPhone)}`,
    `Delivery address: ${value(shipment.receiverAddress || shipment.destination)}`,
    `Sender: ${value(shipment.senderName)}`,
    `Cargo: ${value(shipment.cargoDescription)}`,
    `Weight: ${shipment.weight ? `${shipment.weight} kg` : "Not provided"}`,
    `Origin: ${value(shipment.origin)}`,
    `Destination: ${value(shipment.destination)}`,
    `Current location: ${value(shipment.location)}`,
    `Status: ${shipment.status}`,
    `Expected delivery: ${value(shipment.eta)}`,
    "Please send me the payment instructions.",
  ].join("\n");
}
