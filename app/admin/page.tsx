"use client";

import { useLanguage } from "@/app/language-provider";
import { bootstrapPasswordHash } from "@/lib/admin-bootstrap";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  deleteShipmentRecord,
  generateTrackingCode,
  progressForStatus,
  readShipments,
  saveShipment,
  Shipment,
  shipmentStatuses,
  shipmentStorageNotice,
  ShipmentStatus,
  updateShipmentRecord,
} from "@/lib/shipments";
import { createClient } from "@/utils/supabase/client";
import ShipmentDetailsEditor, { ShipmentFields, validateTrackingDetails } from "./shipment-details-editor";
import SupportInbox from "./support-inbox";

async function hashPassword(password: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

const emptyForm = {
  customerName: "",
  customerEmail: "",
  cargoDescription: "",
  origin: "",
  destination: "",
  location: "",
  eta: "",
  note: "",
  status: "Booked" as ShipmentStatus,
};

type AdminAccount = {
  email: string;
  passwordHash: string;
  role: "Super admin" | "Admin";
  createdAt: string;
};

const ADMIN_SESSION_KEY = "bluecrest-logistics-admin-session";
const ADMIN_ACCOUNTS_KEY = "bluecrest-logistics-admin-accounts";
const SUPER_ADMIN_EMAIL = "support@bluecrestshipping.com";


const superAdminAccount: AdminAccount = {
  email: SUPER_ADMIN_EMAIL,
  passwordHash: bootstrapPasswordHash,
  role: "Super admin",
  createdAt: "system",
};

function readAdminAccounts() {
  if (typeof window === "undefined") return [superAdminAccount];

  try {
    const stored = window.localStorage.getItem(ADMIN_ACCOUNTS_KEY);
    const accounts = stored ? (JSON.parse(stored) as AdminAccount[]) : [];
    const mergedAccounts = [superAdminAccount, ...accounts.filter((account) => account.email !== SUPER_ADMIN_EMAIL)];
    window.localStorage.setItem(ADMIN_ACCOUNTS_KEY, JSON.stringify(mergedAccounts.filter((account) => account.role !== "Super admin")));
    return mergedAccounts;
  } catch {
    return [superAdminAccount];
  }
}

function saveAdminAccounts(accounts: AdminAccount[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    ADMIN_ACCOUNTS_KEY,
    JSON.stringify(accounts.filter((account) => account.role !== "Super admin")),
  );
}

function formatStorageError(bucket: string, action: string, error: unknown) {
  if (!error || typeof error !== "object") {
    return `Supabase ${action} failed for bucket "${bucket}".`;
  }

  const storageError = error as {
    message?: string;
    name?: string;
    status?: number | string;
    statusCode?: number | string;
    error?: string;
  };
  const status = storageError.statusCode ?? storageError.status;
  const details = [storageError.message, storageError.error, storageError.name].filter(Boolean).join(" ");

  return `Supabase ${action} failed for bucket "${bucket}"${status ? ` (HTTP ${status})` : ""}: ${
    details || "check that the bucket exists and has Storage policies for uploads"
  }`;
}

export default function AdminPage() {
  const { localize } = useLanguage();
  const [mobileSection, setMobileSection] = useState("overview");

  function navigateSection(section: string) {
    setMobileSection(section);
    if (window.matchMedia("(max-width: 1023px)").matches) window.scrollTo({ top: 0, behavior: "instant" });
  }

  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [extraDetails, setExtraDetails] = useState<Partial<Shipment>>({});
  const [selectedId, setSelectedId] = useState("");
  const [createPhoto, setCreatePhoto] = useState<File | null>(null);
  const [replacementPhoto, setReplacementPhoto] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [adminMessage, setAdminMessage] = useState("");
  const [isLoginVisible, setIsLoginVisible] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentAdmin, setCurrentAdmin] = useState<AdminAccount | null>(null);
  const [adminAccounts, setAdminAccounts] = useState<AdminAccount[]>([superAdminAccount]);
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [loginMessage, setLoginMessage] = useState("");
  const [newAdminForm, setNewAdminForm] = useState({ email: "", password: "" });

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const accounts = readAdminAccounts();
      setAdminAccounts(accounts);

      if (window.location.hash.toLowerCase() === "#admin" || new URLSearchParams(window.location.search).get("admin") === "1") {
        setIsLoginVisible(true);
      }

      const sessionEmail = window.localStorage.getItem(ADMIN_SESSION_KEY);
      const sessionAccount = accounts.find((account) => account.email === sessionEmail);
      if (sessionAccount) {
        setCurrentAdmin(sessionAccount);
        setIsAuthenticated(true);
        setIsLoginVisible(true);
      }
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    const reveal = () => setIsLoginVisible(true);
    window.addEventListener("admin-access", reveal);
    return () => window.removeEventListener("admin-access", reveal);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    const timeout = window.setTimeout(async () => {
      try {
        setShipments(await readShipments());
        setAdminMessage("");
      } catch (error) {
        setAdminMessage(error instanceof Error ? error.message : "Unable to load shipments from Firebase.");
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [isAuthenticated]);

  const visibleShipments = useMemo(() => {
    if (!currentAdmin) return [];
    if (currentAdmin.role === "Super admin") return shipments;

    const adminEmail = currentAdmin.email.toLowerCase();
    return shipments.filter((shipment) => shipment.createdBy?.toLowerCase() === adminEmail);
  }, [shipments, currentAdmin]);

  const selectedShipment = useMemo(
    () => visibleShipments.find((shipment) => shipment.id === selectedId) ?? visibleShipments[0],
    [selectedId, visibleShipments],
  );

  async function uploadShipmentPhoto(file: File, shipmentId: string, trackingCode: string) {
    const supabase = createClient();
    const bucket = process.env.NEXT_PUBLIC_SUPABASE_SHIPMENT_PHOTOS_BUCKET ?? "blue";
    const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "-") || "shipment-photo.jpg";
    const filePath = `shipments/${trackingCode}/${shipmentId}-${Date.now()}-${safeFileName}`;

    if (!file.type.startsWith("image/")) {
      throw new Error("Upload an image file for the shipment photo.");
    }
    if (file.size > 10 * 1024 * 1024) throw new Error("Choose a shipment photo smaller than 10 MB.");

    const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });

    if (uploadError) {
      throw new Error(formatStorageError(bucket, "upload", uploadError));
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);

    return {
      photoPath: filePath,
      photoUrl: data.publicUrl,
    };
  }

  async function createShipment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setAdminMessage("");

    try {
      const now = new Date().toISOString();
      const status = form.status;
      const id = `bc-${crypto.randomUUID()}`;
      validateTrackingDetails(extraDetails);
      const trackingCode = extraDetails.trackingCode?.trim() || generateTrackingCode();
      if (extraDetails.trackingCode?.trim() && (await readShipments()).some(item => item.trackingCode.toLowerCase() === trackingCode.toLowerCase())) throw new Error("That tracking number is already in use.");
      const photoData = createPhoto ? await uploadShipmentPhoto(createPhoto, id, trackingCode) : {};
      const shipment: Shipment = {
        ...extraDetails,
        id,
        trackingCode,
        customerName: form.customerName.trim() || "Bluecrest Logistics Client",
        customerEmail: form.customerEmail.trim(),
        cargoDescription: form.cargoDescription.trim() || "Commercial freight shipment",
        origin: form.origin.trim() || "Bluecrest Logistics dispatch hub",
        destination: form.destination.trim() || "Client receiving point",
        location: form.location.trim() || form.origin.trim() || "Awaiting pickup",
        status,
        eta: form.eta ? new Date(form.eta).toISOString() : "Pending schedule",
        note: form.note.trim(),
        progress: progressForStatus(status),
        ...photoData,
        createdBy: currentAdmin?.email ?? SUPER_ADMIN_EMAIL,
        createdByRole: currentAdmin?.role ?? "Admin",
        createdAt: now,
        updatedAt: now,
      };

      const nextShipments = await saveShipment(shipment, shipments);
      setShipments(nextShipments);
      setSelectedId(shipment.id);
      setForm(emptyForm);
      setExtraDetails({});
      navigateSection("details");
      setCreatePhoto(null);
      setAdminMessage(`Shipment created. Tracking code: ${shipment.trackingCode}. ${shipmentStorageNotice()}`);
    } catch (error) {
      setAdminMessage(error instanceof Error ? error.message : "Unable to create shipment.");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteShipment(shipment: Shipment) {
    const shouldDelete = window.confirm(`Delete order ${shipment.trackingCode}? This removes it from shipment tracking.`);
    if (!shouldDelete) return;

    setIsSaving(true);
    setAdminMessage("");

    try {
      const nextShipments = await deleteShipmentRecord(shipment.id, shipments);
      const nextVisibleShipments =
        currentAdmin?.role === "Super admin"
          ? nextShipments
          : nextShipments.filter((item) => item.createdBy?.toLowerCase() === currentAdmin?.email.toLowerCase());
      setShipments(nextShipments);
      setSelectedId((currentId) => {
        if (currentId !== shipment.id) return currentId;
        return nextVisibleShipments[0]?.id ?? "";
      });
      setReplacementPhoto(null);
      setAdminMessage(`Order deleted: ${shipment.trackingCode}. ${shipmentStorageNotice()}`);
    } catch (error) {
      setAdminMessage(error instanceof Error ? error.message : "Unable to delete order.");
    } finally {
      setIsSaving(false);
    }
  }

  async function replaceShipmentPhoto(shipment: Shipment) {
    if (!replacementPhoto) return;

    setIsSaving(true);
    setAdminMessage("");

    try {
      const photoData = await uploadShipmentPhoto(
        replacementPhoto,
        shipment.id,
        shipment.trackingCode,
      );
      const nextShipments = await updateShipmentRecord(shipment.id, photoData, shipments);
      setShipments(nextShipments);
      setReplacementPhoto(null);
      setAdminMessage("Shipment photo replaced successfully.");
      if (shipment.photoPath) {
        const bucket = process.env.NEXT_PUBLIC_SUPABASE_SHIPMENT_PHOTOS_BUCKET ?? "blue";
        const { error } = await createClient().storage.from(bucket).remove([shipment.photoPath]);
        if (error) setAdminMessage("New photo saved to Firebase. The previous photo could not be removed from storage.");
      }
    } catch (error) {
      setAdminMessage(error instanceof Error ? error.message : "Unable to replace shipment photo.");
    } finally {
      setIsSaving(false);
    }
  }

  function copyCode(code: string) {
    void navigator.clipboard?.writeText(code);
  }

  async function loginAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = loginForm.email.trim().toLowerCase();
    const account = adminAccounts.find((item) => item.email.toLowerCase() === email);

    if (!account || account.passwordHash !== await hashPassword(loginForm.password)) {
      setLoginMessage("Invalid admin email or password.");
      return;
    }

    setCurrentAdmin(account);
    setIsAuthenticated(true);
    setLoginMessage("");
    window.localStorage.setItem(ADMIN_SESSION_KEY, account.email);
  }

  function logoutAdmin() {
    setCurrentAdmin(null);
    setIsAuthenticated(false);
    setLoginForm({ email: "", password: "" });
    window.localStorage.removeItem(ADMIN_SESSION_KEY);
  }

  async function createAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (currentAdmin?.role !== "Super admin") return;
    const email = newAdminForm.email.trim().toLowerCase();
    const password = newAdminForm.password;

    if (!email || !password) {
      setAdminMessage("Enter an email and password for the new admin.");
      return;
    }

    if (adminAccounts.some((account) => account.email.toLowerCase() === email)) {
      setAdminMessage("An admin with that email already exists.");
      return;
    }

    const nextAccounts = [
      ...adminAccounts,
      {
        email,
        passwordHash: await hashPassword(password),
        role: "Admin" as const,
        createdAt: new Date().toISOString(),
      },
    ];
    setAdminAccounts(nextAccounts);
    saveAdminAccounts(nextAccounts);
    setNewAdminForm({ email: "", password: "" });
    setAdminMessage(`Admin added: ${email}`);
  }

  if (!isLoginVisible) {
    return localize(
      <div
        className="min-h-[72vh] bg-[#f5f8fc] outline-none"
        aria-label="Admin portal hidden"
      >
        <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600">Bluecrest Logistics</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-blue-950 sm:text-5xl">
            Operations workspace
          </h1>
          <p className="mx-auto mt-5 max-w-2xl leading-7 text-blue-950/65">
            This workspace is restricted to authorized Bluecrest Logistics staff.
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return localize(
      <div className="min-h-[72vh] bg-[#f5f8fc] px-4 py-16 sm:px-6">
        <form onSubmit={loginAdmin} className="mx-auto max-w-md rounded-[28px] border border-blue-100 bg-white p-6 shadow-xl shadow-blue-950/10 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600">Admin login</p>
          <h1 className="mt-3 text-3xl font-semibold text-blue-950">Bluecrest operations access</h1>
          <p className="mt-3 text-sm leading-6 text-blue-950/65">
            Enter an authorized admin account to manage shipments, locations, photos, and tracking status.
          </p>
          <div className="mt-6 grid gap-4">
            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-950/55">Email</span>
              <input
                type="email"
                value={loginForm.email}
                onChange={(event) => setLoginForm((current) => ({ ...current, email: event.target.value }))}
                className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-blue-950 outline-none transition focus:border-blue-500 focus:bg-white"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-950/55">Password</span>
              <input
                type="password"
                value={loginForm.password}
                onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-blue-950 outline-none transition focus:border-blue-500 focus:bg-white"
              />
            </label>
            {loginMessage ? <p className="rounded-2xl bg-blue-50 p-4 text-sm text-blue-700">{loginMessage}</p> : null}
            <button className="rounded-full bg-blue-600 px-6 py-4 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-blue-500">
              Login
            </button>
          </div>
        </form>
      </div>
    );
  }

  return localize(
    <div data-mobile-section={mobileSection} className="admin-dashboard relative bg-[#f5f8fc] pb-20 pt-4 sm:pb-24 lg:pt-10">
      <nav aria-label="Dashboard sections" className="sticky top-0 z-40 mx-4 mb-5 rounded-2xl border border-blue-100 bg-white/95 p-3 shadow-lg backdrop-blur lg:hidden">
        <label htmlFor="dashboard-section" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-blue-600">Admin dashboard</label>
        <select id="dashboard-section" value={mobileSection} onChange={event => navigateSection(event.target.value)} className="min-h-11 w-full rounded-xl border border-blue-200 bg-blue-50 px-3 text-base font-semibold text-blue-950">
          <option value="overview">Overview &amp; account</option>
          <option value="create">Create shipment</option>
          <option value="records">Shipment records</option>
          <option value="support">Customer support</option>
          <option value="details">Update shipment</option>
          {currentAdmin?.role === "Super admin" ? <option value="admins">Manage admins</option> : null}
        </select>
      </nav>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <section data-dashboard-panel="overview" className="overflow-hidden rounded-[30px] bg-blue-950 text-white shadow-[0_34px_100px_rgba(16,43,70,0.22)]">
          <div className="grid gap-8 p-6 sm:p-10 lg:grid-cols-[1fr_0.8fr] lg:p-14">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-100 sm:text-sm sm:tracking-[0.34em]">Admin operations</p>
              <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
                Create shipments and control tracking updates.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-white/78 sm:text-lg sm:leading-8">
                Use this workspace to create customer shipments, generate Bluecrest tracking codes, update shipment status, and keep current location details fresh for the public tracking page.
              </p>
            </div>
            <div className="grid gap-3 rounded-[24px] border border-white/15 bg-white/10 p-5 backdrop-blur">
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-sm font-semibold">Signed in as</p>
                <p className="mt-1 break-words text-lg font-semibold">{currentAdmin?.email}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.18em] text-blue-100">{currentAdmin?.role}</p>
                <button
                  type="button"
                  onClick={logoutAdmin}
                  className="mt-4 rounded-full bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-blue-700 transition hover:bg-blue-50"
                >
                  Logout
                </button>
              </div>
              <div>
                <p className="text-4xl font-semibold">{visibleShipments.length}</p>
                <p className="mt-1 text-sm uppercase tracking-[0.2em] text-blue-100">Created shipments</p>
              </div>
              <div className="rounded-2xl bg-white p-4 text-blue-950">
                <p className="text-sm font-semibold">Latest tracking code</p>
                <p className="mt-2 break-words text-xl font-semibold text-blue-700">
                  {visibleShipments[0]?.trackingCode ?? "Create a shipment"}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="contents lg:mt-10 lg:grid lg:gap-8 lg:grid-cols-[0.92fr_1.08fr]">
          {adminMessage ? <p role="status" className="mb-4 rounded-2xl bg-blue-50 p-4 text-sm text-blue-700 lg:hidden">{adminMessage}</p> : null}
          <form data-dashboard-panel="create" onSubmit={createShipment} className="rounded-[28px] border border-blue-100 bg-white p-5 shadow-xl shadow-blue-950/10 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-600">Create shipment</p>
            <h2 className="mt-3 text-3xl font-semibold text-blue-950">New cargo file</h2>
            <div className="mt-7 grid gap-4">
              {[
                ["customerName", "Receiver name", "e.g. Prime Imports Ltd"],
                ["customerEmail", "Customer email", "client@example.com"],
                ["cargoDescription", "Cargo description", "e.g. 42 cartons of electronics"],
                ["origin", "Departure location", "e.g. Shanghai warehouse"],
                ["destination", "Destination", "e.g. Rotterdam receiving hub"],
                ["location", "Current location", "e.g. Awaiting pickup"],
                ["eta", "ETA", ""],
              ].map(([name, label, placeholder]) => (
                <label key={name} className="grid gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-950/55">{label}</span>
                  <input
                    type={name === "eta" ? "datetime-local" : name === "customerEmail" ? "email" : "text"}
                    value={form[name as keyof typeof form]}
                    onChange={(event) => setForm((current) => ({ ...current, [name]: event.target.value }))}
                    placeholder={placeholder}
                    className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-blue-950 outline-none transition placeholder:text-blue-950/35 focus:border-blue-500 focus:bg-white"
                  />
                </label>
              ))}
              <label className="grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-950/55">Status</span>
                <select
                  value={form.status}
                  onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as ShipmentStatus }))}
                  className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-blue-950 outline-none transition focus:border-blue-500 focus:bg-white"
                >
                  {shipmentStatuses.map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 rounded-[22px] border border-blue-100 bg-blue-50 p-4">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-950/55">Optional shipment photo</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => setCreatePhoto(event.target.files?.[0] ?? null)}
                  className="text-sm text-blue-950 file:mr-4 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700"
                />
                <span className="text-xs leading-5 text-blue-950/55">
                  Upload one cargo photo. It will be stored in Supabase and the URL saved with the shipment.
                </span>
              </label>
              <label className="grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-950/55">Tracking note (optional)</span>
                <textarea aria-label="Tracking note (optional)" rows={4} maxLength={2000} value={form.note} onChange={event => setForm(current => ({ ...current, note: event.target.value }))} placeholder="Add a message for the customer, if needed." className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-blue-950 outline-none focus:border-blue-500 focus:bg-white" />
                <span className="text-xs text-slate-500">Shown on the tracking page only when provided.</span>
              </label>
              <details className="rounded-xl border border-blue-100 bg-blue-50 p-4"><summary className="cursor-pointer font-semibold text-blue-950">Full tracking details (optional)</summary><div className="mt-4"><label className="mb-4 grid gap-2 text-sm text-blue-950">Custom tracking number<input value={extraDetails.trackingCode ?? ""} onChange={event=>setExtraDetails(current=>({...current,trackingCode:event.target.value}))} placeholder="Leave empty to generate automatically" className="w-full rounded-xl border border-blue-200 bg-white p-3" /></label><ShipmentFields extendedOnly value={extraDetails} onChange={setExtraDetails}/></div></details>
              {adminMessage ? <p className="hidden rounded-2xl bg-blue-50 p-4 text-sm text-blue-700 lg:block">{adminMessage}</p> : null}
              <button disabled={isSaving} className="mt-2 rounded-full bg-blue-600 px-6 py-4 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-300">
                {isSaving ? "Saving..." : "Create and generate code"}
              </button>
            </div>
          </form>

          <div className="contents lg:grid lg:gap-6">
            <SupportInbox operatorEmail={currentAdmin!.email} />
            <section data-dashboard-panel="records" className="rounded-[28px] border border-blue-100 bg-white p-5 shadow-xl shadow-blue-950/10 sm:p-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-600">Created shipments</p>
                  <h2 className="mt-3 text-3xl font-semibold text-blue-950">Shipment records</h2>
                </div>
                <p className="rounded-full bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">{visibleShipments.length} visible</p>
              </div>

              <div className="mt-7 grid gap-3">
                {visibleShipments.length ? (
                  visibleShipments.map((shipment) => (
                    <article
                      key={shipment.id}
                      className={`rounded-[22px] border p-4 text-left transition ${
                        selectedShipment?.id === shipment.id
                          ? "border-blue-500 bg-blue-50"
                          : "border-blue-100 bg-white hover:border-blue-300 hover:bg-blue-50/60"
                      }`}
                    >
                      <button type="button" onClick={() => { setSelectedId(shipment.id); navigateSection("details"); }} className="block w-full text-left">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-lg font-semibold text-blue-950">{shipment.customerName}</p>
                            <p className="mt-1 text-sm text-blue-950/62">{shipment.cargoDescription}</p>
                          </div>
                          <span className="w-fit rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">
                            {shipment.status}
                          </span>
                        </div>
                        <p className="mt-4 break-words text-sm font-semibold text-blue-700">{shipment.trackingCode}</p>
                        <p className="mt-2 text-sm text-blue-950/60">{shipment.location}</p>
                        {currentAdmin?.role === "Super admin" ? (
                          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-blue-950/45">
                            Created by {shipment.createdBy ?? "Legacy shipment"}
                          </p>
                        ) : null}
                        {shipment.photoUrl ? (
                          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-blue-600">Photo attached</p>
                        ) : null}
                      </button>
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => deleteShipment(shipment)}
                        className="mt-4 rounded-full border border-blue-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-blue-700 transition hover:border-blue-500 hover:bg-blue-600 hover:text-white disabled:cursor-not-allowed disabled:border-blue-100 disabled:bg-blue-50 disabled:text-blue-300"
                      >
                        Delete order
                      </button>
                    </article>
                  ))
                ) : (
                  <div className="rounded-[22px] bg-blue-50 p-6 text-blue-950/70">
                    {currentAdmin?.role === "Super admin"
                      ? "No shipments yet. Create the first cargo file to generate a Bluecrest tracking code."
                      : "No shipments created by this admin yet."}
                  </div>
                )}
              </div>
            </section>

            {!selectedShipment ? <section data-dashboard-panel="details" className="rounded-2xl bg-white p-6 text-blue-950 lg:hidden"><p>Select a shipment from records to update it.</p><button type="button" onClick={() => navigateSection("records")} className="mt-4 min-h-11 rounded-full bg-blue-600 px-5 text-sm font-semibold text-white">View records</button></section> : null}
            {selectedShipment ? (
              <section data-dashboard-panel="details" className="rounded-[28px] border border-blue-100 bg-white p-5 shadow-xl shadow-blue-950/10 sm:p-8">
                <button type="button" onClick={() => navigateSection("records")} className="mb-4 min-h-11 rounded-full bg-blue-50 px-4 text-sm font-semibold text-blue-700 lg:hidden">Back to records</button>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-600">Update shipment</p>
                <div className="mt-4 rounded-[22px] bg-blue-50 p-5">
                  <p className="text-sm font-semibold text-blue-950">Bluecrest tracking code</p>
                  <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="break-words text-2xl font-semibold text-blue-700">{selectedShipment.trackingCode}</p>
                    <button
                      type="button"
                      onClick={() => copyCode(selectedShipment.trackingCode)}
                      className="rounded-full bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-blue-700 transition hover:bg-blue-100"
                    >
                      Copy code
                    </button>
                  </div>
                </div>

                <div className="mt-6 grid gap-4">
                  {selectedShipment.photoUrl ? (
                    <div className="overflow-hidden rounded-[22px] border border-blue-100 bg-blue-50">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={selectedShipment.photoUrl} alt="Current shipment cargo" className="h-64 w-full object-cover" />
                      <p className="p-4 text-sm text-blue-950/65">Current shipment photo. Uploading a new photo replaces this one in Supabase.</p>
                    </div>
                  ) : (
                    <div className="rounded-[22px] bg-blue-50 p-5 text-sm text-blue-950/65">
                      No shipment photo stored yet.
                    </div>
                  )}
                  <label className="grid gap-2 rounded-[22px] border border-blue-100 bg-blue-50 p-4">
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-950/55">Replace shipment photo</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => setReplacementPhoto(event.target.files?.[0] ?? null)}
                      className="text-sm text-blue-950 file:mr-4 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700"
                    />
                    <button
                      type="button"
                      disabled={!replacementPhoto || isSaving}
                      onClick={() => replaceShipmentPhoto(selectedShipment)}
                      className="rounded-full bg-blue-600 px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-300"
                    >
                      {isSaving ? "Uploading..." : "Upload and replace photo"}
                    </button>
                  </label>
                </div>
                {selectedShipment.photoUrl ? <button type="button" disabled={isSaving} onClick={async () => {
                  setIsSaving(true);
                  try { setShipments(await updateShipmentRecord(selectedShipment.id, {photoUrl:"",photoPath:""}, shipments)); setAdminMessage("Shipment photo removed from tracking."); }
                  catch(error) { setAdminMessage(error instanceof Error ? error.message : "Unable to remove the photo."); }
                  finally { setIsSaving(false); }
                }} className="mt-4 min-h-11 text-sm font-semibold text-red-700 disabled:opacity-50">Remove shipment photo</button> : null}
                <ShipmentDetailsEditor key={selectedShipment.id} shipment={selectedShipment} onSave={async updates => {
                  const code = (updates.trackingCode ?? selectedShipment.trackingCode).trim();
                  if (!code) throw new Error("Enter a tracking number.");
                  if (code.toLowerCase() !== selectedShipment.trackingCode.toLowerCase() && (await readShipments()).some(item => item.id !== selectedShipment.id && item.trackingCode.toLowerCase() === code.toLowerCase())) throw new Error("That tracking number is already in use.");
                  const next = await updateShipmentRecord(selectedShipment.id, {...updates, trackingCode: code}, shipments);
                  setShipments(next);
                  return next.find(item => item.id === selectedShipment.id)!;
                }} />
              </section>
            ) : null}

            {currentAdmin?.role === "Super admin" ? (
              <section data-dashboard-panel="admins" className="rounded-[28px] border border-blue-100 bg-white p-5 shadow-xl shadow-blue-950/10 sm:p-8">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-600">Admin management</p>
                <h2 className="mt-3 text-3xl font-semibold text-blue-950">Add admin</h2>
                <p className="mt-3 text-sm leading-6 text-blue-950/65">
                  Super admins can create additional admin accounts for shipment operations.
                </p>
                <form onSubmit={createAdmin} className="mt-6 grid gap-4">
                  <label className="grid gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-950/55">Admin email</span>
                    <input
                      type="email"
                      value={newAdminForm.email}
                      onChange={(event) => setNewAdminForm((current) => ({ ...current, email: event.target.value }))}
                      placeholder="admin@example.com"
                      className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-blue-950 outline-none transition placeholder:text-blue-950/35 focus:border-blue-500 focus:bg-white"
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-950/55">Temporary password</span>
                    <input
                      type="password"
                      value={newAdminForm.password}
                      onChange={(event) => setNewAdminForm((current) => ({ ...current, password: event.target.value }))}
                      placeholder="Set password"
                      className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-blue-950 outline-none transition placeholder:text-blue-950/35 focus:border-blue-500 focus:bg-white"
                    />
                  </label>
                  <button className="rounded-full bg-blue-600 px-6 py-4 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-blue-500">
                    Add admin account
                  </button>
                </form>
                <div className="mt-6 grid gap-3">
                  {adminAccounts.map((account) => (
                    <div key={account.email} className="rounded-[20px] bg-blue-50 p-4">
                      <p className="break-words font-semibold text-blue-950">{account.email}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.16em] text-blue-600">{account.role}</p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
