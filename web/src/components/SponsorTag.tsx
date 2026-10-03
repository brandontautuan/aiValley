import { useState } from "react";
import { UiIcon } from "./UiIcon.tsx";

export type Sponsor = "zoowork" | "tavily";

const SPONSORS: Record<Sponsor, { name: string; icon: "spark" | "search"; role: string }> = {
  zoowork: { name: "ZooWork", icon: "spark", role: "AI agent" },
  tavily: { name: "Tavily", icon: "search", role: "live web search" },
};

/**
 * Small provenance chip. Only render it where the sponsor's service actually
 * produced the content next to it; use a neutral tag when a fallback was used.
 */
export function SponsorTag({ sponsor, label }: { sponsor: Sponsor; label?: string }) {
  const meta = SPONSORS[sponsor];
  return (
    <span className={`sponsor-tag ${sponsor}`} title={`${meta.name}: ${meta.role}`}>
      <UiIcon name={meta.icon} size={13} />
      {label ?? meta.name}
    </span>
  );
}

// Official logo files in web/public/logos, unmodified apart from trimming empty margin (see that folder's README).
const LOGOS: Record<Sponsor, { src: string; name: string; href: string }> = {
  tavily: { src: "/logos/tavily.png", name: "Tavily", href: "https://tavily.com" },
  zoowork: { src: "/logos/zoowork.png", name: "ZooWork", href: "https://zoowork.ai" },
};

/**
 * The sponsor's own logo, shown unmodified on a chip matching the artwork's own background (white for
 * Tavily, navy for ZooWork) so it stays legible in both themes. Falls back to the text tag if the file is missing.
 */
export function SponsorLogo({ sponsor, height = 22 }: { sponsor: Sponsor; height?: number }) {
  const [missing, setMissing] = useState(false);
  const logo = LOGOS[sponsor];
  if (missing) return <SponsorTag sponsor={sponsor} />;
  return (
    <a className={`sponsor-logo ${sponsor}`} href={logo.href} target="_blank" rel="noreferrer" aria-label={`${logo.name} (opens their website)`}>
      <img src={logo.src} alt={logo.name} style={{ height }} onError={() => setMissing(true)} />
    </a>
  );
}

/** Footer credit shown on every page; links to the explanation of what each service does. */
export function SponsorFooter({ href }: { href: string }) {
  return (
    <footer className="sponsor-footer">
      <span>Competitor and review research by <SponsorLogo sponsor="tavily" height={18} /></span>
      <span>AI drafts and strategy by <SponsorLogo sponsor="zoowork" height={18} /></span>
      <a className="link" href={href}>How it works <UiIcon name="arrowRight" size={14} /></a>
    </footer>
  );
}
