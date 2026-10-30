"use client";

import { useLanguage } from "@/app/language-provider";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import ShipmentResult from "./shipment-result";
import { findShipment, readShipments, watchShipment, type Shipment } from "@/lib/shipments";

export default function TrackPage() {
  const { localize } = useLanguage();

  const [code, setCode] = useState("");
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const shipmentId = shipment?.id;
  useEffect(() => {
    if (!shipmentId) return;
    return watchShipment(shipmentId, updated => {
      setShipment(updated);
      setError("");
    }, () => setError("Live updates are temporarily unavailable. Showing the last received shipment details; search again to refresh."));
  }, [shipmentId]);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const initial = (params.get("code") || params.get("trackingnumber") || params.get("trackingNumber"))?.trim();
    if (!initial) return;
    const timer = setTimeout(async () => {
      setCode(initial);
      setLoading(true);
      try {
        const records = await readShipments();
        if (active) { setShipment(findShipment(initial, records)); setSearched(true); }
      } catch { if (active) setError("Tracking is temporarily unavailable. Please try again."); }
      finally { if (active) setLoading(false); }
    }, 0);
    return () => { active = false; clearTimeout(timer); };
  }, []);

  async function track(event: FormEvent) {
    event.preventDefault();
    if (!code.trim()) return;
    setLoading(true); setError(""); setShipment(null);
    try { setShipment(findShipment(code, await readShipments())); setSearched(true); }
    catch { setError("Tracking is temporarily unavailable. Please try again."); }
    finally { setLoading(false); }
  }

  return localize(<main className="shipment-tracking-page">
    <header className="tracking-page-header"><div><h1><i className="fas fa-box" aria-hidden="true"/> Shipment Tracking</h1><p><Link href="/">Home</Link><span>/</span>Tracking</p></div><Link href="/" className="tracking-home-link">Back to Home</Link></header>
    <form onSubmit={track} className="tracking-search"><label><span className="sr-only">Tracking code</span><input required value={code} onChange={event=>setCode(event.target.value)} placeholder="Enter your tracking number" /></label><button disabled={loading}>{loading ? "Checking..." : "Track shipment"}</button></form>
    <p role="status" className="tracking-search-message">{error || (searched && !shipment && !loading ? "No matching shipment was found. Check your code or contact support." : "")}</p>
    {shipment && <ShipmentResult shipment={shipment}/>}
  </main>);
}
