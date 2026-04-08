import type { AdminAccount } from "@rematch/shared-types";

import { getRulesetPdfPaths } from "../lib/server/repository";
import { getStorageClient } from "../lib/server/supabase";
import { RulesetPdfButton } from "./ruleset-pdf-button";

const BUCKET_NAME = "ruleset-pdfs";

async function getPublicUrl(path: string): Promise<string | null> {
  const storage = getStorageClient();
  if (!storage) return null;
  const { data } = storage.from(BUCKET_NAME).getPublicUrl(path);
  return data?.publicUrl ?? null;
}

async function getSignedUrl(path: string): Promise<string | null> {
  const storage = getStorageClient();
  if (!storage) return null;
  const { data, error } = await storage.from(BUCKET_NAME).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function RulesetNavButtons({ viewer }: { viewer?: AdminAccount | null }) {
  const { publicRulesetPdfPath, adminRulesetPdfPath } = await getRulesetPdfPaths();

  const publicUrl = publicRulesetPdfPath ? await getPublicUrl(publicRulesetPdfPath) : null;
  const adminUrl = viewer && adminRulesetPdfPath ? await getSignedUrl(adminRulesetPdfPath) : null;

  return (
    <>
      {publicUrl && <RulesetPdfButton url={publicUrl} label="Ruleset" />}
      {adminUrl && <RulesetPdfButton url={adminUrl} label="Admin Rules" />}
    </>
  );
}
