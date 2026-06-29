import { redirect } from "next/navigation";
import { getSetupState } from "./actions";
import { SetupForm } from "@/components/setup-form";
import { SchemaMissingNotice } from "@/components/schema-missing-notice";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const { state, error } = await getSetupState();
  if (state === "ready") redirect("/login");
  if (state === "schema_missing") return <SchemaMissingNotice error={error} />;
  return <SetupForm />;
}
