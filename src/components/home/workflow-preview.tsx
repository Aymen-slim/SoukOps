"use client";

import { Check, MarkerPin01, Microphone01 } from "@untitledui/icons";
import { InstagramIcon, WhatsAppIcon } from "@/components/brand-icons";

export type HomeTrack = "shops" | "pro";

export function WorkflowPreview({ track }: { track: HomeTrack }) {
  const isShops = track === "shops";

  return (
    <div className="mt-10 border border-[#E4E4E7] bg-[#F4F4F5] p-4 sm:p-8 lg:p-10">
      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-[1fr_auto_1.08fr_auto_1fr] lg:gap-0">
        {/* Step 1: Incoming message */}
        <div className="flex flex-col border border-[#E4E4E7] bg-white">
          <div className="flex items-center justify-between border-b border-[#E4E4E7] px-4 py-3 font-mono text-[11px] uppercase tracking-[0.08em] text-[#52525B]">
            <span>{isShops ? "Customer message" : "Incoming DMs"}</span>
            <span>{isShops ? "WhatsApp · IG" : "IG · WhatsApp"}</span>
          </div>

          <div className="flex flex-1 flex-col justify-between gap-3 p-4">
            {isShops ? (
              <>
                <div className="border border-[#E4E4E7] bg-[#FAFAF9] p-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-[#09090B]">
                    <span className="inline-flex size-5 items-center justify-center bg-[#25D366] text-white">
                      <WhatsAppIcon className="size-3.5" />
                    </span>
                    <span>Yasmine · Story reply</span>
                    <span className="ml-auto font-mono text-[11px] text-[#71717A]">14:22</span>
                  </div>

                  <div className="mt-3 flex items-center gap-3 border border-[#E4E4E7] bg-white p-2">
                    <div
                      aria-hidden="true"
                      className="flex size-11 shrink-0 items-center justify-center bg-[#FEF3C6] font-mono text-[11px] font-medium text-[#7B3306]"
                    >
                      PHOTO
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-[#09090B]">Instagram Story screenshot</p>
                      <p className="text-xs text-[#52525B]">Yellow hoodie · Size L</p>
                    </div>
                  </div>
                </div>

                <div className="border border-[#D0FAE5] bg-[#F2FBF7] p-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-[#0B3D29]">
                    <Microphone01 className="size-3.5 shrink-0 text-[#1B8A5E]" aria-hidden="true" />
                    <span>Voice note (0:06)</span>
                  </div>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-[#09090B]" dir="auto">
                    &ldquo;Salem, b9addech el sweat el jaune taille L? Noskon fi Ennasr.&rdquo;
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="border border-[#E4E4E7] bg-[#FAFAF9] p-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-[#09090B]">
                    <span className="inline-flex size-5 items-center justify-center bg-gradient-to-tr from-[#FEDA75] via-[#D62976] to-[#4F5BD5] text-white">
                      <InstagramIcon className="size-3.5" />
                    </span>
                    <span>PayTunisia Brand · DM</span>
                    <span className="ml-auto font-mono text-[11px] text-[#71717A]">10:15</span>
                  </div>
                  <p className="mt-2 text-[13px] leading-relaxed text-[#27272A]" dir="auto">
                    &ldquo;Bonjour! On lance notre app à Tunis — intéressée par 2 Reels en Derja? Budget 2,800 DT.&rdquo;
                  </p>
                </div>

                <div className="border border-[#E4E4E7] bg-[#FAFAF9] p-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-[#09090B]">
                    <span className="inline-flex size-5 items-center justify-center bg-[#25D366] text-white">
                      <WhatsAppIcon className="size-3.5" />
                    </span>
                    <span>Client · WhatsApp</span>
                    <span className="ml-auto font-mono text-[11px] text-[#71717A]">10:18</span>
                  </div>
                  <p className="mt-2 text-[13px] leading-relaxed text-[#27272A]" dir="auto">
                    &ldquo;Ahla, 9addech el consultation w wa9tech fama rendez-vous?&rdquo;
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Connector 1 */}
        <div className="hidden flex-col items-center justify-center px-3 lg:flex" aria-hidden="true">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#71717A]">
            {isShops ? "Understands" : "In your voice"}
          </span>
          <div className="mt-1.5 w-12 border-t border-dashed border-[#A1A1AA]" />
        </div>

        {/* Step 2: Wassalha handles it */}
        <div className="flex flex-col border border-[#E4E4E7] bg-white">
          <div className="flex items-center justify-between border-b border-[#E4E4E7] px-4 py-3 font-mono text-[11px] uppercase tracking-[0.08em] text-[#52525B]">
            <span>Wassalha assistant</span>
            <span className="text-[#15704C]">24/7</span>
          </div>

          <div className="flex flex-1 flex-col justify-center gap-2.5 p-4">
            {(isShops
              ? [
                  { title: "Matched Yellow Hoodie (L)", detail: "In stock · 120 DT list price" },
                  { title: "Agreed on 112 DT", detail: "Protected your 105 DT lowest price" },
                  { title: "Got exact house map pin", detail: "Ennasr, Tunis · +7 DT delivery" },
                ]
              : [
                  { title: "Replied in your Derja & French style", detail: "Shared rates, hours & prep details" },
                  { title: "Collected client details", detail: "Name, phone (+216) & preferred date" },
                  { title: "Spotted 2,800 DT paid deal", detail: "96% match · Pitch drafted for review" },
                ]
            ).map((task) => (
              <div
                key={task.title}
                className="flex items-center justify-between gap-3 border border-[#E4E4E7] bg-[#FAFAF9] px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-[#09090B]">{task.title}</p>
                  <p className="mt-0.5 text-xs text-[#52525B]">{task.detail}</p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 bg-[#09090B] px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-white">
                  <Check className="size-3" aria-hidden="true" />
                  Done
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Connector 2 */}
        <div className="hidden flex-col items-center justify-center px-3 lg:flex" aria-hidden="true">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#71717A]">Review</span>
          <div className="mt-1.5 w-12 border-t border-dashed border-[#A1A1AA]" />
        </div>

        {/* Step 3: You decide */}
        <div className="flex flex-col border border-[#E4E4E7] bg-white">
          <div className="flex items-center justify-between border-b border-[#E4E4E7] px-4 py-3 font-mono text-[11px] uppercase tracking-[0.08em] text-[#52525B]">
            <span>{isShops ? "Your shop desk" : "Your daily briefing"}</span>
            <span>You decide</span>
          </div>

          <div className="flex flex-1 flex-col justify-between gap-4 p-4">
            {isShops ? (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-medium text-[#09090B]">ORDER #123</span>
                    <span className="border border-[#A4F4CF] bg-[#F2FBF7] px-2 py-0.5 font-mono text-[11px] font-medium text-[#15704C]">
                      LOW RISK
                    </span>
                  </div>
                  <p className="text-sm font-medium text-[#09090B]">Yellow Hoodie · Size L</p>
                  <div className="flex items-center gap-1.5 text-xs text-[#52525B]">
                    <MarkerPin01 className="size-3.5 text-[#1B8A5E]" aria-hidden="true" />
                    <span>Ennasr, Ariana · Door pin confirmed</span>
                  </div>
                  <div className="flex items-baseline justify-between border-t border-[#E4E4E7] pt-2.5">
                    <span className="text-xs text-[#52525B]">Total cash on delivery</span>
                    <span className="font-mono text-sm font-semibold tabular-nums text-[#09090B]">119 DT</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 border-t border-[#E4E4E7] pt-3">
                  <span className="inline-flex flex-1 items-center justify-center bg-[#1B8A5E] px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-white">
                    Approve &amp; Ship
                  </span>
                  <span className="inline-flex items-center justify-center border border-[#D4D4D8] bg-white px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-[#09090B]">
                    Edit
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-medium text-[#09090B]">OPPORTUNITY</span>
                    <span className="border border-[#A4F4CF] bg-[#F2FBF7] px-2 py-0.5 font-mono text-[11px] font-medium text-[#15704C]">
                      96% MATCH
                    </span>
                  </div>
                  <p className="text-sm font-medium text-[#09090B]">PayTunisia App Launch · 2 Reels</p>
                  <p className="text-xs leading-relaxed text-[#52525B]">
                    Draft reply ready in your exact tone. Waiting for your click before anything is sent.
                  </p>
                  <div className="flex items-baseline justify-between border-t border-[#E4E4E7] pt-2.5">
                    <span className="text-xs text-[#52525B]">Offered budget</span>
                    <span className="font-mono text-sm font-semibold tabular-nums text-[#09090B]">2,800 DT</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 border-t border-[#E4E4E7] pt-3">
                  <span className="inline-flex flex-1 items-center justify-center bg-[#1B8A5E] px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-white">
                    Send Pitch
                  </span>
                  <span className="inline-flex items-center justify-center border border-[#D4D4D8] bg-white px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-[#09090B]">
                    Review
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
