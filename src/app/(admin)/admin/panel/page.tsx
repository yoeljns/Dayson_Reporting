import { redirect } from "next/navigation";

// The İş Panosu merged into the main manager dashboard; keep old links working.
export default function ManagerPanelPage() {
  redirect("/admin");
}
