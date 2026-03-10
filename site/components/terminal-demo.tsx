"use client"

import { useEffect, useState, useRef } from "react"
import { motion, AnimatePresence } from "motion/react"

interface Line {
  prefix: string
  content: string
  delay: number
  highlight?: boolean
  success?: boolean
  link?: boolean
  dimmed?: boolean
}

const deployLines: Line[] = [
  { prefix: "[preflight]", content: "Checking environment...", delay: 0 },
  { prefix: "[preflight]", content: "\u2713 Docker installed (27.4.1)", delay: 600, highlight: true },
  { prefix: "[preflight]", content: "\u2713 Docker Hub authenticated", delay: 1000, highlight: true },
  { prefix: "[preflight]", content: "\u2713 Sealos Cloud connected", delay: 1400, highlight: true },
  { prefix: "", content: "", delay: 1700 },
  { prefix: "[mode]", content: "No existing deployment found \u2192 DEPLOY", delay: 2000, highlight: true },
  { prefix: "", content: "", delay: 2200 },
  { prefix: "[assess]", content: "Scanning project...", delay: 2400 },
  { prefix: "[assess]", content: "Next.js + TypeScript \u2192 ready to deploy", delay: 3000, highlight: true },
  { prefix: "", content: "", delay: 3200 },
  { prefix: "[dockerfile]", content: "Generating optimized Dockerfile...", delay: 3400 },
  { prefix: "[dockerfile]", content: "Multi-stage build with standalone output", delay: 3900, highlight: true },
  { prefix: "", content: "", delay: 4100 },
  { prefix: "[build]", content: "Building & pushing myuser/demo-app:latest...", delay: 4300 },
  { prefix: "[build]", content: "\u2713 Image pushed to Docker Hub", delay: 5200, highlight: true },
  { prefix: "", content: "", delay: 5400 },
  { prefix: "[deploy]", content: "Deployment complete!", delay: 5700, highlight: true, success: true },
  { prefix: "[deploy]", content: "\u2192 https://demo-app.cloud.sealos.run", delay: 6100, link: true },
]

const updateLines: Line[] = [
  { prefix: "[preflight]", content: "\u2713 Environment ready", delay: 0, highlight: true },
  { prefix: "[preflight]", content: "\u2713 kubectl connected to cluster", delay: 400, highlight: true },
  { prefix: "", content: "", delay: 600 },
  { prefix: "[mode]", content: "Found running deployment: demo-app \u2192 UPDATE", delay: 900, highlight: true },
  { prefix: "", content: "", delay: 1100 },
  { prefix: "[build]", content: "Building & pushing myuser/demo-app:latest...", delay: 1300 },
  { prefix: "[build]", content: "\u2713 Image pushed to Docker Hub", delay: 2200, highlight: true },
  { prefix: "", content: "", delay: 2400 },
  { prefix: "[update]", content: "Rolling update \u2192 kubectl set image...", delay: 2600 },
  { prefix: "[update]", content: "\u2713 Rollout complete \u2014 all pods healthy", delay: 3400, highlight: true, success: true },
  { prefix: "[update]", content: "\u2192 https://demo-app.cloud.sealos.run", delay: 3800, link: true },
]

export function TerminalDemo() {
  const [phase, setPhase] = useState<"idle" | "typing-deploy" | "deploy" | "pause" | "typing-update" | "update">("idle")
  const [visibleCount, setVisibleCount] = useState(0)
  const [typingText, setTypingText] = useState("")
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const deployCommand = "/sealos-deploy"
  const updateCommand = "/sealos-deploy"

  // Start on scroll into view
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && phase === "idle") {
          setPhase("typing-deploy")
        }
      },
      { threshold: 0.3 }
    )
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [phase])

  // Typing effect
  useEffect(() => {
    if (phase !== "typing-deploy" && phase !== "typing-update") return
    const cmd = phase === "typing-deploy" ? deployCommand : updateCommand
    let i = 0
    setTypingText("")
    const timer = setInterval(() => {
      if (i <= cmd.length) {
        setTypingText(cmd.slice(0, i))
        i++
      } else {
        clearInterval(timer)
        setPhase(phase === "typing-deploy" ? "deploy" : "update")
      }
    }, 35)
    return () => clearInterval(timer)
  }, [phase])

  // Deploy lines animation
  useEffect(() => {
    if (phase !== "deploy") return
    setVisibleCount(0)
    const timers: ReturnType<typeof setTimeout>[] = []
    deployLines.forEach((line, i) => {
      timers.push(
        setTimeout(() => setVisibleCount(i + 1), line.delay)
      )
    })
    // After deploy finishes, pause then start update
    const lastDelay = deployLines[deployLines.length - 1].delay
    timers.push(
      setTimeout(() => setPhase("pause"), lastDelay + 1500)
    )
    return () => timers.forEach(clearTimeout)
  }, [phase])

  // Pause then start update typing
  useEffect(() => {
    if (phase !== "pause") return
    const timer = setTimeout(() => setPhase("typing-update"), 800)
    return () => clearTimeout(timer)
  }, [phase])

  // Update lines animation
  useEffect(() => {
    if (phase !== "update") return
    setVisibleCount(0)
    const timers: ReturnType<typeof setTimeout>[] = []
    updateLines.forEach((line, i) => {
      timers.push(
        setTimeout(() => setVisibleCount(i + 1), line.delay)
      )
    })
    return () => timers.forEach(clearTimeout)
  }, [phase])

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [visibleCount, typingText, phase])

  const currentLines = phase === "update" ? updateLines : deployLines
  const isTyping = phase === "typing-deploy" || phase === "typing-update"
  const showLines = phase === "deploy" || phase === "update"
  const showDeployDone = phase === "pause" || phase === "typing-update" || phase === "update"

  return (
    <section ref={containerRef} className="flex justify-center px-6 py-16">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-3xl"
      >
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {/* Title bar */}
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <div className="h-3 w-3 rounded-full bg-muted-foreground/20" />
            <div className="h-3 w-3 rounded-full bg-muted-foreground/20" />
            <div className="h-3 w-3 rounded-full bg-muted-foreground/20" />
            <span className="ml-3 font-mono text-xs text-muted-foreground">
              ~/my-project
            </span>
          </div>

          {/* Terminal content */}
          <div ref={scrollRef} className="h-[420px] overflow-y-auto p-5 font-mono text-sm leading-relaxed">
            {/* Deploy command */}
            <div className={`mb-3 ${showDeployDone ? "text-muted-foreground/50" : "text-muted-foreground"}`}>
              <span className="text-primary">$</span>{" "}
              <span className={showDeployDone ? "text-foreground/50" : "text-foreground"}>
                {phase === "typing-deploy" ? typingText : (phase !== "idle" ? deployCommand : "")}
                {phase === "typing-deploy" && (
                  <span className="inline-block w-2 h-4 ml-0.5 bg-primary animate-cursor-blink align-middle" />
                )}
              </span>
            </div>

            {/* Deploy output */}
            {(phase === "deploy" || showDeployDone) && (
              <AnimatePresence>
                {(showDeployDone ? deployLines : deployLines.slice(0, visibleCount)).map((line, i) => {
                  if (!line.content) return <div key={`d-${i}`} className="h-3" />
                  return (
                    <motion.div
                      key={`d-${i}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: showDeployDone ? 0.4 : 1 }}
                      transition={{ duration: 0.2 }}
                      className="flex gap-2"
                    >
                      {line.prefix && (
                        <span className={`shrink-0 ${line.success ? (showDeployDone ? "text-primary/40" : "text-primary") : "text-muted-foreground/60"}`}>
                          {line.prefix}
                        </span>
                      )}
                      <span
                        className={
                          showDeployDone
                            ? "text-foreground/40"
                            : line.success
                              ? "font-bold text-primary"
                              : line.link
                                ? "text-primary underline underline-offset-2"
                                : line.highlight
                                  ? "text-foreground"
                                  : "text-muted-foreground"
                        }
                      >
                        {line.content}
                      </span>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            )}

            {/* Separator between deploy and update */}
            {(phase === "typing-update" || phase === "update") && (
              <div className="my-4 border-t border-border/50" />
            )}

            {/* Update command */}
            {(phase === "typing-update" || phase === "update") && (
              <div className="mb-3 text-muted-foreground">
                <span className="text-primary">$</span>{" "}
                <span className="text-foreground">
                  {phase === "typing-update" ? typingText : updateCommand}
                  {phase === "typing-update" && (
                    <span className="inline-block w-2 h-4 ml-0.5 bg-primary animate-cursor-blink align-middle" />
                  )}
                </span>
              </div>
            )}

            {/* Update output */}
            {phase === "update" && (
              <AnimatePresence>
                {updateLines.slice(0, visibleCount).map((line, i) => {
                  if (!line.content) return <div key={`u-${i}`} className="h-3" />
                  return (
                    <motion.div
                      key={`u-${i}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.2 }}
                      className="flex gap-2"
                    >
                      {line.prefix && (
                        <span className={`shrink-0 ${line.success ? "text-primary" : "text-muted-foreground/60"}`}>
                          {line.prefix}
                        </span>
                      )}
                      <span
                        className={
                          line.success
                            ? "font-bold text-primary"
                            : line.link
                              ? "text-primary underline underline-offset-2"
                              : line.highlight
                                ? "text-foreground"
                                : "text-muted-foreground"
                        }
                      >
                        {line.content}
                      </span>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            )}

            {/* Cursor while lines are loading */}
            {phase === "deploy" && visibleCount < deployLines.length && (
              <span className="inline-block h-4 w-2 bg-primary/80 animate-cursor-blink" />
            )}
            {phase === "update" && visibleCount < updateLines.length && (
              <span className="inline-block h-4 w-2 bg-primary/80 animate-cursor-blink" />
            )}
          </div>
        </div>
      </motion.div>
    </section>
  )
}
