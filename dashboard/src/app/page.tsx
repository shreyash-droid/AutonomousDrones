import Link from "next/link";
import { ArrowRight, FolderGit2, Play } from "lucide-react";
import Navbar from "@/components/landing/Navbar";
import FieldScene from "@/components/landing/FieldScene";
import Pipeline from "@/components/landing/Pipeline";
import AiShowcase from "@/components/landing/AiShowcase";
import Architecture from "@/components/landing/Architecture";
import Impact from "@/components/landing/Impact";
import Modes from "@/components/landing/Modes";
import { Reveal } from "@/components/ui/motion";
import Logo from "@/components/ui/Logo";

const STACK = ["YOLO11", "Ultralytics", "PyTorch / NCNN", "OpenCV", "ArduPilot", "MAVLink 2", "Pixhawk",
  "Raspberry Pi 5", "Arduino", "FastAPI", "WebSockets", "Next.js", "React"];

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        {/* ------------------------------------------------------------ hero */}
        <section className="relative overflow-hidden pt-16">
          <div className="grid-bg pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />
          <div className="pointer-events-none absolute -left-32 top-24 h-[480px] w-[480px] rounded-full bg-brand/15 blur-[130px]" />
          <div className="pointer-events-none absolute right-0 top-0 h-[420px] w-[420px] rounded-full bg-sky/10 blur-[130px]" />

          <div className="relative mx-auto grid max-w-7xl gap-12 px-4 pb-20 pt-16 sm:px-6 sm:pt-24 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:pb-28">
            <div>
              <Reveal>
                <span className="chip">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                  Autonomous Drones · 7th Semester Project
                </span>
              </Reveal>
              <Reveal delay={0.08}>
                <h1 className="mt-6 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
                  Precision weed control, <span className="text-gradient">piloted by AI.</span>
                </h1>
              </Reveal>
              <Reveal delay={0.16}>
                <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-2">
                  An autonomous drone surveys the field and finds every weed with a YOLO11 vision model. It pins each
                  weed to a GPS coordinate and sprays herbicide only there, using about{" "}
                  <span className="font-semibold text-ink">96% less chemical</span> than blanket spraying.
                </p>
              </Reveal>
              <Reveal delay={0.24}>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link href="/dashboard" className="btn btn-primary px-5 py-3">
                    Open dashboard <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link href="/dashboard/simulator" className="btn btn-ghost px-5 py-3">
                    <Play className="h-4 w-4" /> Watch a live mission
                  </Link>
                </div>
              </Reveal>
              <Reveal delay={0.32}>
                <dl className="mt-12 grid max-w-lg grid-cols-3 gap-6 border-t border-line pt-6">
                  {[["93", "weeds detected"], ["96.4%", "chemical saved"], ["~110 ms", "per AI inference"]].map(([v, l]) => (
                    <div key={l}>
                      <dt className="num text-2xl font-semibold text-ink">{v}</dt>
                      <dd className="mt-1 text-xs text-muted">{l}</dd>
                    </div>
                  ))}
                </dl>
              </Reveal>
            </div>

            <Reveal delay={0.2} y={40}>
              <div className="relative">
                <div className="absolute -inset-4 rounded-[28px] bg-gradient-to-br from-brand/20 via-transparent to-sky/20 blur-2xl" />
                <div className="relative rounded-[22px] border border-line-strong bg-surface p-2 shadow-[0_40px_100px_-40px_rgba(0,0,0,0.9)]">
                  <FieldScene />
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ------------------------------------------------------------ problem strip */}
        <section className="border-y border-line bg-surface/40">
          <div className="mx-auto grid max-w-7xl gap-px overflow-hidden px-4 sm:px-6 md:grid-cols-3">
            {[
              ["The problem", "Weeds compete with crops for water, light and nutrients. Blanket herbicide spraying treats the whole field, even though weeds cover a tiny fraction of it."],
              ["Our approach", "Computer vision on an autonomous drone finds each weed, records its position, and treats only that spot with a measured dose."],
              ["The result", "Much less chemical, protected crops, and a GPS weed map the farmer can use to plan the next season."],
            ].map(([t, d], i) => (
              <Reveal key={t} delay={i * 0.08}>
                <div className="py-10 md:px-8 md:first:pl-0">
                  <p className="font-mono text-xs text-brand">0{i + 1}</p>
                  <h3 className="mt-2 text-lg font-semibold">{t}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-2">{d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <Pipeline />
        <AiShowcase />
        <Architecture />
        <Impact />
        <Modes />

        {/* ------------------------------------------------------------ stack + CTA */}
        <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
          <Reveal>
            <p className="eyebrow text-center">Built with</p>
            <div className="mx-auto mt-5 flex max-w-4xl flex-wrap justify-center gap-2">
              {STACK.map((s) => <span key={s} className="chip">{s}</span>)}
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="relative mt-20 overflow-hidden rounded-3xl border border-brand/30 bg-gradient-to-br from-[#0f2219] via-surface to-[#0d1a26] p-10 text-center sm:p-14">
              <div className="grid-bg pointer-events-none absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
              <div className="relative">
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">See it fly.</h2>
                <p className="mx-auto mt-3 max-w-xl text-ink-2">
                  Run a full autonomous mission in the browser: takeoff, survey, live AI detection, spot-spraying and
                  return-to-launch. It uses the same software that flies the real drone.
                </p>
                <div className="mt-8 flex flex-wrap justify-center gap-3">
                  <Link href="/dashboard/simulator" className="btn btn-primary px-5 py-3">
                    <Play className="h-4 w-4" /> Launch simulator
                  </Link>
                  <Link href="/dashboard/detect" className="btn btn-ghost px-5 py-3">Try the detector</Link>
                </div>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted sm:flex-row sm:px-6">
          <div className="flex items-center gap-2.5">
            <Logo className="h-6 w-6" />
            <span>AgriDrone AI · Autonomous weed detection &amp; spot-spraying</span>
          </div>
          <div className="flex items-center gap-5">
            <Link href="/dashboard" className="hover:text-ink">Dashboard</Link>
            <a href="#hardware" className="hover:text-ink">Hardware</a>
            <span className="inline-flex items-center gap-1.5"><FolderGit2 className="h-4 w-4" /> AI-Weed-Detection</span>
          </div>
        </div>
      </footer>
    </>
  );
}
