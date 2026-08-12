import type { Metadata } from "next";
import { GuideView } from "./guide-view";

export const metadata: Metadata = {
  title: "Help & guide · Hipla Customer Hub",
};

// The in-app help guide (spec: not a spec feature — an internal onboarding aid).
// Content lives in lib/guide-content.ts and is shared with the Q&A assistant
// route so the page and the answers never drift.
export default function GuidePage() {
  return <GuideView />;
}
