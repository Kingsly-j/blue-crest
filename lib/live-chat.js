export const SUPPORT_PHONE = '19152019157';
export const SUPPORT_EMAIL = 'support@bluecrestshipping.com';

export function buildSupportFallback(question = '') {
  const cleanedQuestion = String(question || '').trim() || 'a shipment or logistics question';
  const adminMessage = `Hello, I’m browsing the website and need help with: ${cleanedQuestion}`;

  return {
    answer:
      'I can connect you with our support team right away. They can help with shipment updates, delivery questions, pricing, and any issue I can’t answer here.',
    needsHuman: true,
    adminContactHref: `https://wa.me/${SUPPORT_PHONE}?text=${encodeURIComponent(adminMessage)}`,
    adminEmail: SUPPORT_EMAIL,
    adminMessage,
  };
}

export function buildAnswerForQuestion(question = '') {
  const cleaned = String(question || '').trim();
  if (!cleaned) return '';

  const normalized = cleaned.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');

  if (/(track|tracking|status of my shipment|where is my shipment|shipment status)/.test(normalized)) {
    return 'You can track your shipment by entering the tracking code on our tracking page. If the status has not updated yet, please allow up to 24 hours for new tracking scans to appear.';
  }

  if (/(how long|delivery time|when will it arrive|arrive|eta|expected delivery)/.test(normalized)) {
    return 'Delivery timing depends on the origin, destination, and selected service. For the most accurate estimate, check the shipment status page or contact support with your tracking code.';
  }

  if (/(quote|pricing|price|rate|cost)/.test(normalized)) {
    return 'You can request a free quote through the contact form on our website or by contacting our support team with your cargo details and destination.';
  }

  if (/(customs|import|export|documents|clearance)/.test(normalized)) {
    return 'Customs delays usually happen when paperwork is incomplete or destination rules require extra checks. If your shipment is delayed, contact support with the tracking number so we can assist.';
  }

  if (/(contact|call|email|support|phone|whatsapp)/.test(normalized)) {
    return 'You can contact Bluecrest Logistics by phone at +1 (915) 201-9157, WhatsApp, or email at support@bluecrestshipping.com.';
  }

  if (/(payment|pay|paid|storage fee|arrange payment)/.test(normalized)) {
    return 'You can arrange payment by sending the fee details through WhatsApp or by emailing support@bluecrestshipping.com with your tracking number and payment request.';
  }

  if (/(service|international|domestic|freight|courier|shipping)/.test(normalized)) {
    return 'Bluecrest Logistics provides international and domestic freight, courier, and shipment tracking solutions for individuals and businesses.';
  }

  return '';
}

export function isHumanEscalationRequired(answer = '') {
  const cleaned = String(answer || '').trim();
  if (!cleaned) return true;

  const uncertaintyPatterns = [
    /i\s+don['’]?t\s+know/i,
    /i\s+can['’]?t\s+(help|answer|assist)/i,
    /i\s+am\s+not\s+sure/i,
    /please\s+contact\s+support/i,
    /contact\s+our\s+support/i,
    /unable\s+to\s+answer/i,
    /not\s+able\s+to\s+help/i,
  ];

  return uncertaintyPatterns.some((pattern) => pattern.test(cleaned));
}
