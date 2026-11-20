import Link from "next/link";
import { ArrowRight, MarkerPin01, MessageChatCircle, ShieldTick } from "@untitledui/icons";
import { InstagramIcon, MessengerIcon, WhatsAppIcon } from "@/components/brand-icons";

const CHANNEL_POINTS = [
  {
    title: "WhatsApp, Instagram & Messenger in one place",
    body: "Connect your accounts once. Every message, Story reply, and voice note lands in one clean inbox so nothing slips through.",
  },
  {
    title: "Speaks Tunisian Derja, French, Arabic & English",
    body: "Replies naturally the way people in Tunisia actually text and talk — never stiff, robotic, or awkward.",
  },
  {
    title: "One map link instead of ten phone calls",
    body: "Customers tap a link to drop a pin on their front door. Drivers arrive the first time with fewer returned parcels.",
  },
] as const;

export function ChannelsShowcase() {
  return (
    <div className="grid items-start gap-12 lg:grid-cols-[0.92fr_1.08fr] lg:gap-16">
      <div>
        <h2 className="text-[clamp(1.75rem,1.35rem+1.35vw,2.35rem)] leading-[1.1] font-medium tracking-[-0.035em] text-balance text-[#09090B]">
          Right inside the apps your customers already use.
        </h2>

        <div className="mt-10 divide-y divide-[#E4E4E7] border-t border-b border-[#E4E4E7]">
          {CHANNEL_POINTS.map((point) => (
            <div key={point.title} className="py-6">
              <h3 className="text-[1.2rem] leading-[1.25] font-medium tracking-[-0.02em] text-[#09090B]">
                {point.title}
              </h3>
              <p className="mt-2 max-w-[56ch] text-[0.975rem] leading-[1.6] text-pretty text-[#52525B]">
                {point.body}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Crisp Gurusup 2x2 framed visual showcase */}
      <div className="border border-[#E4E4E7] bg-[#F4F4F5] p-5 sm:p-7">
        <div className="grid gap-4 sm:grid-cols-2">
          {/* WhatsApp card */}
          <Link
            href="/demo?platform=whatsapp"
            className="group flex flex-col justify-between border border-[#E4E4E7] bg-white p-4 transition-colors hover:border-[#09090B] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B8A5E]"
          >
            <div>
              <div className="flex items-center justify-between gap-2 border-b border-[#E4E4E7] pb-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex size-6 items-center justify-center bg-[#25D366] text-white">
                    <WhatsAppIcon className="size-3.5" />
                  </span>
                  <span className="text-sm font-medium text-[#09090B]">WhatsApp</span>
                </div>
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#15704C]">Voice + Pin</span>
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-[#52525B]">
                Listens to Derja voice notes, replies with clear prices, and sends a one-tap map pin link.
              </p>
            </div>
            <div className="mt-4 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-[#09090B]">
              <span>Try WhatsApp</span>
              <ArrowRight className="gs-arrow-shift size-3.5" aria-hidden="true" />
            </div>
          </Link>

          {/* Instagram card */}
          <Link
            href="/demo?platform=instagram"
            className="group flex flex-col justify-between border border-[#E4E4E7] bg-white p-4 transition-colors hover:border-[#09090B] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B8A5E]"
          >
            <div>
              <div className="flex items-center justify-between gap-2 border-b border-[#E4E4E7] pb-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex size-6 shrink-0 items-center justify-center bg-gradient-to-tr from-[#FEDA75] via-[#D62976] to-[#4F5BD5] text-white">
                    <InstagramIcon className="size-3.5" />
                  </span>
                  <span className="text-sm font-medium text-[#09090B]">Instagram</span>
                </div>
                <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.08em] text-[#52525B]">
                  Story match
                </span>
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-[#52525B]">
                Recognizes products from Story screenshots and answers creator or brand DMs in your tone.
              </p>
            </div>
            <div className="mt-4 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-[#09090B]">
              <span>Try Instagram</span>
              <ArrowRight className="gs-arrow-shift size-3.5" aria-hidden="true" />
            </div>
          </Link>

          {/* Messenger card */}
          <Link
            href="/demo?platform=messenger"
            className="group flex flex-col justify-between border border-[#E4E4E7] bg-white p-4 transition-colors hover:border-[#09090B] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B8A5E]"
          >
            <div>
              <div className="flex items-center justify-between gap-2 border-b border-[#E4E4E7] pb-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex size-6 items-center justify-center bg-[#0084FF] text-white">
                    <MessengerIcon className="size-3.5" />
                  </span>
                  <span className="text-sm font-medium text-[#09090B]">Messenger</span>
                </div>
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#52525B]">Page inbox</span>
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-[#52525B]">
                Answers Facebook Page shoppers day and night using the same live stock and price rules.
              </p>
            </div>
            <div className="mt-4 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-[#09090B]">
              <span>Try Messenger</span>
              <ArrowRight className="gs-arrow-shift size-3.5" aria-hidden="true" />
            </div>
          </Link>

          {/* Contrast dark card (echoing Gurusup's crisp black terminal tile) */}
          <div className="flex flex-col justify-between border border-[#09090B] bg-[#09090B] p-4 text-white">
            <div className="flex items-center justify-between gap-2 border-b border-white/15 pb-3 font-mono text-[11px] uppercase tracking-[0.08em] text-white/75">
              <span>Built-in safeguards</span>
              <ShieldTick className="size-4 text-[#2ECF8F]" aria-hidden="true" />
            </div>
            <ul className="mt-3 space-y-2 font-mono text-xs text-white/90">
              <li className="flex items-center gap-2">
                <span className="size-1.5 shrink-0 bg-[#2ECF8F]" aria-hidden="true" />
                <span>Never drops below your lowest price</span>
              </li>
              <li className="flex items-center gap-2">
                <MarkerPin01 className="size-3 shrink-0 text-[#2ECF8F]" aria-hidden="true" />
                <span>No order without phone + map pin</span>
              </li>
              <li className="flex items-center gap-2">
                <MessageChatCircle className="size-3 shrink-0 text-[#2ECF8F]" aria-hidden="true" />
                <span>Urgent alerts escalate immediately</span>
              </li>
            </ul>
            <p className="mt-4 font-mono text-[11px] text-white/65">You always have the final say.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
