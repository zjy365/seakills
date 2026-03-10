"use client"

import { motion, useInView } from "motion/react"
import { useRef } from "react"

const preflightStep = { label: "Preflight", desc: "Check Docker, Docker Hub, Sealos Cloud, and kubectl availability." }
const modeStep = { label: "Mode Detection", desc: "Check for existing deployment. If found, switch to UPDATE path." }

const deploySteps = [
  { label: "Assess", desc: "Analyze project language, framework, and deployment readiness." },
  { label: "Detect", desc: "Search for existing container images to skip unnecessary builds." },
  { label: "Dockerfile", desc: "Auto-generate an optimized Dockerfile if one is missing." },
  { label: "Build & Push", desc: "Build the container image and push to Docker Hub." },
  { label: "Deploy", desc: "Generate a Sealos template and deploy to Sealos Cloud." },
]

const updateSteps = [
  { label: "Build & Push", desc: "Rebuild the container image with latest changes and push." },
  { label: "Rolling Update", desc: "kubectl set image for zero-downtime rolling update." },
  { label: "Verify", desc: "Confirm rollout succeeded. Auto-rollback on failure." },
]

function StepItem({
  step,
  index,
  isInView,
  baseDelay,
  number,
}: {
  step: { label: string; desc: string }
  index: number
  isInView: boolean
  baseDelay: number
  number: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{
        duration: 0.5,
        delay: baseDelay + index * 0.1,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="relative flex items-start gap-6 pl-0"
    >
      <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={isInView ? { scale: 1 } : { scale: 0 }}
          transition={{ delay: baseDelay + 0.1 + index * 0.1, type: "spring", stiffness: 400, damping: 20 }}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card"
        >
          <span className="font-mono text-xs text-muted-foreground">{number}</span>
        </motion.div>
      </div>
      <div className="pt-1.5">
        <h4 className="font-mono text-sm font-semibold text-foreground">{step.label}</h4>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.desc}</p>
      </div>
    </motion.div>
  )
}

export function PipelineSection() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(sectionRef, { once: true, margin: "-100px" })

  return (
    <section ref={sectionRef} className="flex justify-center px-6 py-24">
      <div className="w-full max-w-3xl">
        <motion.h3
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-2 text-center font-mono text-sm uppercase tracking-widest text-primary"
        >
          Pipeline
        </motion.h3>
        <motion.h2
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.05 }}
          className="mb-16 text-center text-2xl font-bold text-foreground md:text-3xl text-balance"
        >
          What Happens When You Run It
        </motion.h2>

        <div className="relative">
          {/* Main vertical line */}
          <div className="absolute left-[19px] top-0 bottom-0 w-px overflow-hidden">
            <motion.div
              initial={{ scaleY: 0 }}
              animate={isInView ? { scaleY: 1 } : { scaleY: 0 }}
              transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
              className="h-full w-full origin-top bg-border"
            />
          </div>

          <div className="flex flex-col gap-10">
            {/* Step 1: Preflight */}
            <StepItem step={preflightStep} index={0} isInView={isInView} baseDelay={0.3} number="01" />

            {/* Step 2: Mode Detection */}
            <StepItem step={modeStep} index={1} isInView={isInView} baseDelay={0.3} number="02" />

            {/* Branch into DEPLOY and UPDATE */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="grid gap-8 md:grid-cols-2 pl-0"
            >
              {/* DEPLOY path */}
              <div className="relative">
                <div className="mb-6 flex items-center gap-3">
                  <div className="flex h-8 items-center rounded-full border border-primary/30 bg-primary/5 px-4">
                    <span className="font-mono text-xs font-semibold text-primary">DEPLOY</span>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">New project</span>
                </div>

                {/* Deploy vertical line */}
                <div className="absolute left-[15px] top-14 bottom-0 w-px bg-border/60" />

                <div className="flex flex-col gap-6">
                  {deploySteps.map((step, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -8 }}
                      animate={isInView ? { opacity: 1, x: 0 } : {}}
                      transition={{ duration: 0.4, delay: 0.7 + i * 0.08 }}
                      className="relative flex items-start gap-4"
                    >
                      <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card">
                          <span className="font-mono text-[10px] text-muted-foreground">{String(i + 3).padStart(2, "0")}</span>
                        </div>
                      </div>
                      <div className="pt-0.5">
                        <h4 className="font-mono text-xs font-semibold text-foreground">{step.label}</h4>
                        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{step.desc}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* UPDATE path */}
              <div className="relative">
                <div className="mb-6 flex items-center gap-3">
                  <div className="flex h-8 items-center rounded-full border border-primary/30 bg-primary/5 px-4">
                    <span className="font-mono text-xs font-semibold text-primary">UPDATE</span>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">Existing deployment</span>
                </div>

                {/* Update vertical line */}
                <div className="absolute left-[15px] top-14 bottom-0 w-px bg-border/60" />

                <div className="flex flex-col gap-6">
                  {updateSteps.map((step, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -8 }}
                      animate={isInView ? { opacity: 1, x: 0 } : {}}
                      transition={{ duration: 0.4, delay: 0.7 + i * 0.08 }}
                      className="relative flex items-start gap-4"
                    >
                      <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card">
                          <span className="font-mono text-[10px] text-muted-foreground">{String(i + 3).padStart(2, "0")}</span>
                        </div>
                      </div>
                      <div className="pt-0.5">
                        <h4 className="font-mono text-xs font-semibold text-foreground">{step.label}</h4>
                        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{step.desc}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  )
}
