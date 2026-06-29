import { redirect } from "next/navigation";
import { setupNeeded } from "./actions";
import { SetupForm } from "@/components/setup-form";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const needed = await setupNeeded();
  if (!needed) redirect("/login");
  return <SetupForm />;
}
