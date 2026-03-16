"use server";

import { signIn } from "@/auth";

export async function loginWithProvider(formData: FormData) {
  const provider = formData.get("provider") as string;
  const callbackUrl = (formData.get("callbackUrl") as string) || "/dashboard";
  await signIn(provider, { redirectTo: callbackUrl });
}
