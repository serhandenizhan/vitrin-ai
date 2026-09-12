"use client";

/**
 * Parola yazilirken hangi kuralin saglandigini canli gosteren liste.
 *
 * Neden liste, tek hata cumlesi degil: kullanici "gecersiz parola" gorup
 * neyin eksik oldugunu tahmin etmek zorunda kalmasin. Kurallar
 * `lib/password-policy.ts`ten; Supabase ayariyla ayni.
 */
import { Check, Circle } from "lucide-react";

import { checkPassword } from "@/lib/password-policy";
import { cn } from "@/lib/utils";

export function PasswordChecklist({ password, id }: { password: string; id?: string }) {
  const { rules } = checkPassword(password);
  return (
    <ul id={id} className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1" aria-label="Parola kuralları">
      {rules.map((rule) => (
        <li
          key={rule.id}
          className={cn(
            "flex items-center gap-1.5 text-[0.75rem] transition-colors duration-300",
            rule.ok ? "text-emerald-700" : "text-muted-foreground",
          )}
        >
          {rule.ok ? (
            <Check className="size-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
          ) : (
            <Circle className="size-3 shrink-0" strokeWidth={2} aria-hidden />
          )}
          <span>
            {rule.label}
            <span className="sr-only">{rule.ok ? " (sağlandı)" : " (eksik)"}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
