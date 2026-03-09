/**
 * /hybrid-match is now merged into /matching.
 * This redirect keeps old links working.
 */
import { redirect } from "next/navigation";

export default function HybridMatchRedirect() {
  redirect("/matching");
}
