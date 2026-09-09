/**
 * Her sayfanin ortak kabugu: saglayici, sol panel, ust cubuk, studyo katmani
 * ve alt bilgi.
 *
 * Ikinci ve ucuncu sayfa (paketler, katalog) eklenirken bu kabuk cikarildi.
 * Onceden ana sayfa bunlarin hepsini kendi icinde kuruyordu; kopyalansaydi
 * uc sayfa kacinilmaz olarak birbirinden ayrisirdi — ust cubuga bir oge
 * eklenip digerinde unutulmasi an meselesi.
 *
 * Sunucu bileseni: `children` prop olarak geciyor, dolayisiyla sayfalarin
 * tanitim bolumleri sunucu bileseni olmaya devam ediyor ve istemciye inmiyor.
 */

import { Studio } from "@/components/composer/studio";
import { SignInNotice } from "@/components/sign-in-notice";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { WorkSidebar } from "@/components/work-sidebar";
import { WorkspaceProvider } from "@/components/workspace-provider";

export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      <WorkSidebar />
      <SignInNotice />
      {/* Tam ekran calisma alani; yalnizca acikken bir sey ciziyor. */}
      <Studio />
      <SiteHeader />

      <main className="flex-1">{children}</main>

      <SiteFooter />
    </WorkspaceProvider>
  );
}
