import { useState } from "react";
import { Building2, Copy, ExternalLink, Globe, Mail, MapPin, Phone, UserRound, BriefcaseBusiness } from "lucide-react";

type Contact = {
  person_name?: string | null;
  job_title?: string | null;
  company_name?: string | null;
  emails?: string[];
  phone_numbers?: string[];
  website?: string | null;
  address?: string | null;
  other_text?: string[];
};

function safeWebsite(value: string) {
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch { return null; }
}

export default function DigitalBusinessCard({ contact, onEdit }: { contact: Contact; onEdit?: () => void }) {
  const [copied, setCopied] = useState("");
  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(""), 1600);
    } catch {
      setCopied("Clipboard unavailable");
      window.setTimeout(() => setCopied(""), 2200);
    }
  };
  const emails = contact.emails || [];
  const phones = contact.phone_numbers || [];
  const website = contact.website?.trim() ? safeWebsite(contact.website.trim()) : null;
  const hasAny = Boolean(contact.person_name || contact.job_title || contact.company_name || emails.length || phones.length || contact.website || contact.address);

  if (!hasAny) return <div className="digital-card-empty"><UserRound size={20}/><div><strong>No contact details extracted yet</strong><p>Choose Extract Text to create your digital business card.</p></div></div>;

  return <section className="digital-card" aria-label="Extracted digital business card">
    <div className="digital-card-head">
      <div className="digital-avatar"><UserRound size={24}/></div>
      <div className="digital-identity">
        <h3>{contact.person_name || "Unknown contact"}</h3>
        {contact.job_title && <p>{contact.job_title}</p>}
        {contact.company_name && <div className="digital-company"><Building2 size={14}/>{contact.company_name}</div>}
      </div>
      {onEdit && <button className="digital-edit" onClick={onEdit} type="button">Edit</button>}
    </div>
    <div className="digital-fields">
      {emails.map((email) => <div className="digital-field" key={`email-${email}`}><span className="digital-field-icon"><Mail size={16}/></span><div className="digital-field-content"><small>EMAIL</small><a href={`mailto:${email}`}>{email}</a></div><button type="button" className="digital-action" onClick={() => void copy("Email copied", email)} aria-label={`Copy email ${email}`} title="Copy email"><Copy size={15}/></button></div>)}
      {phones.map((phone) => <div className="digital-field" key={`phone-${phone}`}><span className="digital-field-icon"><Phone size={16}/></span><div className="digital-field-content"><small>PHONE</small><a href={`tel:${phone.replace(/[^+\d]/g, "")}`}>{phone}</a></div><button type="button" className="digital-action" onClick={() => void copy("Phone copied", phone)} aria-label={`Copy phone ${phone}`} title="Copy phone"><Copy size={15}/></button></div>)}
      {contact.website && <div className="digital-field"><span className="digital-field-icon"><Globe size={16}/></span><div className="digital-field-content"><small>WEBSITE</small>{website ? <a href={website} target="_blank" rel="noopener noreferrer">{contact.website}</a> : <span>{contact.website}</span>}</div>{website && <a className="digital-action" href={website} target="_blank" rel="noopener noreferrer" aria-label="Open organization website" title="Open website"><ExternalLink size={15}/></a>}<button type="button" className="digital-action" onClick={() => void copy("Website copied", contact.website!)} aria-label="Copy website" title="Copy website"><Copy size={15}/></button></div>}
      {contact.address && <div className="digital-field"><span className="digital-field-icon"><MapPin size={16}/></span><div className="digital-field-content"><small>ADDRESS</small><span>{contact.address}</span></div><button type="button" className="digital-action" onClick={() => void copy("Address copied", contact.address!)} aria-label="Copy address" title="Copy address"><Copy size={15}/></button></div>}
      {contact.person_name && <div className="digital-field"><span className="digital-field-icon"><UserRound size={16}/></span><div className="digital-field-content"><small>CONTACT NAME</small><span>{contact.person_name}</span></div><button type="button" className="digital-action" onClick={() => void copy("Name copied", contact.person_name!)} aria-label="Copy contact name" title="Copy name"><Copy size={15}/></button></div>}
      {contact.job_title && <div className="digital-field"><span className="digital-field-icon"><BriefcaseBusiness size={16}/></span><div className="digital-field-content"><small>JOB TITLE</small><span>{contact.job_title}</span></div><button type="button" className="digital-action" onClick={() => void copy("Job title copied", contact.job_title!)} aria-label="Copy job title" title="Copy job title"><Copy size={15}/></button></div>}
    </div>
    {copied && <p className="digital-copy-feedback" role="status">{copied}</p>}
  </section>;
}
