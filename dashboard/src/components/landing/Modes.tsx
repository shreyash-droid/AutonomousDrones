import { Cpu, MonitorPlay, Plane } from "lucide-react";
import { Reveal } from "@/components/ui/motion";

const MODES = [
  {
    icon: MonitorPlay,
    name: "sim",
    title: "Web simulation",
    text: "Kinematic flight model, a virtual camera over real field imagery, and a virtual tank. The YOLO11 model is real.",
    cmd: "python simulation/server.py",
    rows: [["Flight", "SimFlightController"], ["Camera", "SimCamera"], ["Sprayer", "SimSprayer"]],
  },
  {
    icon: Cpu,
    name: "sitl",
    title: "ArduPilot SITL",
    text: "The real ArduCopter firmware runs on a PC and is driven over MAVLink. This is the flight code path of the actual aircraft.",
    cmd: "python -m drone.main --mode sitl",
    rows: [["Flight", "ArduCopter SITL"], ["Camera", "SimCamera"], ["Sprayer", "SimSprayer"]],
  },
  {
    icon: Plane,
    name: "hardware",
    title: "Real aircraft",
    text: "Pixhawk, Raspberry Pi camera and Arduino sprayer. The software starts at boot and waits for the pilot to select GUIDED.",
    cmd: "python -m drone.main --mode hardware",
    rows: [["Flight", "Pixhawk · MAVLink"], ["Camera", "Picamera2"], ["Sprayer", "Arduino serial"]],
  },
];

export default function Modes() {
  return (
    <section id="modes" className="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32">
      <Reveal className="max-w-2xl">
        <p className="eyebrow text-brand">One code base · three run modes</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          The code that flies the simulator is the code that flies the drone.
        </h2>
        <p className="mt-4 text-ink-2">
          Every hardware dependency sits behind a small interface. A single line in{" "}
          <code className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[13px] text-ink">configs/drone_config.yaml</code>{" "}
          switches the drivers. The mission logic, AI and georeferencing never change.
        </p>
      </Reveal>
      <div className="mt-12 grid gap-4 lg:grid-cols-3">
        {MODES.map((m, i) => (
          <Reveal key={m.name} delay={i * 0.1}>
            <div className="group card flex h-full flex-col p-6 transition-colors hover:border-brand/40">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10 text-brand">
                  <m.icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-mono text-xs text-brand">mode: {m.name}</div>
                  <h3 className="font-semibold">{m.title}</h3>
                </div>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-ink-2">{m.text}</p>
              <dl className="mt-5 divide-y divide-line rounded-xl border border-line text-sm">
                {m.rows.map(([k, v]) => (
                  <div key={k} className="flex justify-between px-3.5 py-2.5">
                    <dt className="text-muted">{k}</dt>
                    <dd className="font-mono text-[12.5px] text-ink">{v}</dd>
                  </div>
                ))}
                <div className="flex justify-between px-3.5 py-2.5">
                  <dt className="text-muted">Mission + AI</dt>
                  <dd className="font-mono text-[12.5px] text-brand">identical</dd>
                </div>
              </dl>
              <div className="mt-auto pt-5">
                <code className="block rounded-lg border border-line bg-bg px-3.5 py-2.5 font-mono text-[12px] text-ink-2">
                  <span className="text-brand">$</span> {m.cmd}
                </code>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
