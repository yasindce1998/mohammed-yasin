// Mohammed Yasin — Immersive WebGL Portfolio Configuration
// Kernel-to-cloud security engineering showcase with interactive 3D ribbon
// physics, liquid shaders, case studies, and live parameter tuning.

export const SITE = {
    url: 'https://mohammedyasin.vercel.app',
    title: 'Mohammed Yasin — Security Engineer & Digital Architect',
    description: 'Mohammed Yasin — security engineer building kernel-level offense and cloud-native defense. eBPF, Rust, Golang, Kubernetes. Interactive WebGL portfolio.',
    locale: 'en_US'
};

export const OWNER = {
    name: 'Mohammed Yasin',
    role: 'Security Engineer & Digital Architect',
    location: 'Bengaluru, India',
    timezone: 'Asia/Kolkata',
    coords: '12.9716° N // 77.5946° E',
    email: 'yasindce1998@gmail.com',
    github: 'https://github.com/yasindce1998',
    linkedin: 'https://linkedin.com/in/mohammed-yasin-4660b9206',
    twitter: 'https://x.com/yasindce1998',
    leetcode: 'https://leetcode.com/u/yasindce1998'
};

// Shared About/resume copy so the modal and the static pages cannot drift.
export const ABOUT = {
    summary: 'I work at the boundary between creation and destruction — kernel-level offense as a rehearsal for defense, and cloud-native defense built from knowing exactly how systems fail. Five years engineering production systems across Golang, Rust, Kubernetes, and eBPF: 11 systems shipped, from kernel observability to enterprise cloud platforms.',
    stats: [
        { value: '5+', label: 'YEARS IN PRODUCTION' },
        { value: '11', label: 'SYSTEMS SHIPPED' },
        { value: 'RING 0 → CLOUD', label: 'RANGE' }
    ]
};

export const SKILLS = [
    'eBPF', 'Linux Kernel', 'Kubernetes', 'Offensive Security',
    'Golang', 'Rust', 'WebAssembly', 'Distributed Systems',
    'Runtime Security', 'Cloud Native', 'AI Agent Security', 'UEFI'
];

export const PROJECTS = [
    {
        id: 'redhands',
        num: '01',
        title: 'RedHands',
        tagline: 'Offensive Security Tooling for AI Agents',
        category: 'OFFENSE',
        focus: 'AI Agent Offense',
        year: '2026',
        status: 'ACTIVE DEVELOPMENT',
        url: 'https://github.com/yasindce1998/RedHands',
        subtitle: 'MCP server exposing offensive-security tooling to AI agents.',
        description: 'An MCP (Model Context Protocol) server that hands AI agents a full offensive-security workbench. Agents can chain reconnaissance, exploitation, and post-exploitation tools through a standardized interface — turning an LLM into an operator with a real toolkit, and giving defenders a platform to study how agentic offense actually behaves.',
        tags: ['Golang', 'MCP', 'AI Agents', 'Offensive Tooling'],
        accent: '#ff2a4d',
        hue: 0.98,
        logs: ['> agent.connect(mcp://redhands)', '> tools.enumerate ... 23 loaded', '> payload.chain(recon, exploit)']
    },
    {
        id: 'aegis-shadow',
        num: '02',
        title: 'Aegis-Shadow',
        tagline: 'Dual-Module eBPF Rootkit & Runtime Auditor',
        category: 'RESEARCH',
        focus: 'Kernel Research',
        year: '2026',
        status: 'RESEARCH',
        url: 'https://github.com/yasindce1998/Aegis-Shadow',
        subtitle: 'Rootkit techniques paired module-for-module with runtime auditing.',
        description: 'A dual-module eBPF framework that pairs kernel rootkit techniques with their runtime audit counterparts — every hiding primitive ships with the detection that catches it. Built to understand ring-0 offense honestly: process hiding, syscall hijacking, and tracepoint manipulation, each mirrored by a verifier-grade audit hook.',
        tags: ['Rust', 'eBPF', 'Linux Kernel', 'Runtime Auditing'],
        accent: '#9d4edd',
        hue: 0.77,
        logs: ['> bpf.load(aegis_shadow.o)', '> ring0.attach(tracepoint)', '> audit.mirror(hide_module) OK']
    },
    {
        id: 'kubedagger',
        num: '03',
        title: 'KubeDagger',
        tagline: 'eBPF Offensive Toolkit for Kubernetes',
        category: 'OFFENSE',
        focus: 'Container Offense',
        year: '2023',
        status: 'STABLE',
        url: 'https://github.com/yasindce1998/KubeDagger',
        subtitle: 'Network discovery, process hiding, and container breakouts from inside the cluster.',
        description: 'An eBPF offensive toolkit built for Kubernetes environments: in-cluster network discovery, process hiding from security agents, and container escape primitives — all running at the kernel level where most runtime defenses cannot see. Designed for red teams validating container hardening and for blue teams understanding their blind spots.',
        tags: ['Golang', 'eBPF', 'Kubernetes', 'Container Escape'],
        accent: '#ff7a1a',
        hue: 0.08,
        logs: ['> net.discover(pod_cidr)', '> hide.from(runtime_agent)', '> breakout.namespace escape']
    },
    {
        id: 'neurontrace',
        num: '04',
        title: 'NeuronTrace',
        tagline: 'Kernel-Level Behavioral Containment for AI Agents',
        category: 'DEFENSE',
        focus: 'AI Agent Defense',
        year: '2026',
        status: 'ACTIVE DEVELOPMENT',
        url: 'https://github.com/yasindce1998/NeuronTrace',
        subtitle: 'Containing AI agent behavior at the syscall layer, before damage lands.',
        description: 'Kernel-level behavioral containment for AI agents operating at the syscall layer. NeuronTrace profiles what an agent is *supposed* to do, then fences what it *can* do — intercepting file, network, and process syscalls through eBPF/LSM hooks so a prompt-injected or runaway agent hits a hard kernel boundary, not a hopeful sandbox.',
        tags: ['Rust', 'eBPF', 'LSM', 'AI Containment'],
        accent: '#00f2fe',
        hue: 0.52,
        logs: ['> profile.agent(policy.yaml)', '> fence.syscalls(openat, execve)', '> contain.breach_attempt BLOCKED']
    },
    {
        id: 'barzakh',
        num: '05',
        title: 'Barzakh',
        tagline: 'Firmware Threat Research Platform',
        category: 'RESEARCH',
        focus: 'Firmware Research',
        year: '2026',
        status: 'RESEARCH',
        url: 'https://github.com/yasindce1998/Barzakh',
        subtitle: 'Modeling bootkit threats from BlackLotus to CosmicStrand — with paired detection.',
        description: 'A firmware research platform modeling real-world bootkit threats — BlackLotus, LogoFAIL, CosmicStrand — as reproducible lab artifacts, each paired with a working detection. Barzakh (the boundary between worlds) studies the gap between firmware and OS: UEFI implants, boot-chain persistence, and the trust boundaries that fail before the kernel ever loads.',
        tags: ['Rust', 'C', 'UEFI', 'Bootkit Analysis'],
        accent: '#ffb700',
        hue: 0.12,
        logs: ['> boot.chain(uefi → shim → grub)', '> implant.model(blacklotus)', '> detect.early_boot OK']
    },
    {
        id: 'warmor',
        num: '06',
        title: 'Warmor',
        tagline: 'eBPF Monitoring with WebAssembly Policies',
        category: 'DEFENSE',
        focus: 'Runtime Defense',
        year: '2025',
        status: 'STABLE',
        url: 'https://github.com/yasindce1998/Warmor',
        subtitle: 'Syscall visibility from eBPF, policy logic from WebAssembly.',
        description: 'Warmor fuses two runtimes: eBPF for zero-overhead syscall monitoring in the kernel, and WebAssembly for expressing security policies as portable, sandboxed modules. Policies compile once and run anywhere — the kernel feeds events, WASM decides, and enforcement happens at the source.',
        tags: ['Golang', 'eBPF', 'WebAssembly', 'Policy Engine'],
        accent: '#00ff9d',
        hue: 0.42,
        logs: ['> monitor.attach(syscall_trace)', '> policy.load(wasm) verified', '> verdict.deny(execve /tmp/x)']
    },
    {
        id: 'staticzero',
        num: '07',
        title: 'StaticZero',
        tagline: 'eBPF Telecom Security Framework',
        category: 'RESEARCH',
        focus: 'Telecom Research',
        year: '2026',
        status: 'RESEARCH',
        url: 'https://github.com/yasindce1998/StaticZero',
        subtitle: 'Rogue towers, downgrade attacks, and IMSI catchers — from 2G through 5G.',
        description: 'An eBPF framework for telecom security research across 2G–5G: detecting rogue base stations, inter-radio downgrade attacks, and IMSI catchers from the device side. StaticZero instruments the modem interface boundary so a phone can tell when the network beneath it stops being trustworthy.',
        tags: ['Rust', 'eBPF', '5G', 'Rogue Tower Detection'],
        accent: '#3a86ff',
        hue: 0.60,
        logs: ['> radio.monitor(2G..5G)', '> downgrade.attack DETECTED', '> tower.trust(fingerprint) LOW']
    }
];

export const CATEGORIES = ['ALL', 'OFFENSE', 'DEFENSE', 'RESEARCH'];

// Experience timeline (About modal)
export const EXPERIENCE = [
    { role: 'Application Developer', company: 'IBM', period: '2025 — PRESENT' },
    { role: 'Software Engineer (A2)', company: 'EPAM Systems', period: '2025' },
    { role: 'Senior Software Developer', company: 'Infosys', period: '2023 — 2025' },
    { role: 'Cyber Security Engineer', company: 'AccuKnox', period: '2021 — 2023' }
];

export const CLIENT_WORK = [
    { client: 'Kroger', via: 'IBM', note: 'Geospatial location services & delivery routing — Golang, PostGIS, YugabyteDB, Redis' },
    { client: 'P&G', via: 'EPAM', note: 'AI-driven video analytics platform — Kafka ingestion, Golang consumers' },
    { client: 'Bank of America', via: 'Infosys', note: 'Self-service cloud provisioning with compliance guardrails — OpenShift, Tekton, ArgoCD' },
    { client: 'AccuKnox SaaS + KubeArmor', via: 'AccuKnox', note: 'Runtime security enforcement & workload hardening — BPF-LSM, AppArmor' }
];

// Alias for backwards compatibility with any systems expecting SECTIONS
export const SECTIONS = PROJECTS.map((p, i) => ({
    id: p.id,
    code: `[ ${p.num} // ${p.category} ]`,
    title: p.title,
    body: p.subtitle,
    project: p
}));

// Defaults for the live parameter panel (press G)
export const PARAMS = {
    // Momentum & Ribbon Physics
    friction: 0.92,
    wheelSpeed: 0.0016,
    dragSpeed: 0.0034,
    magneticSnap: 1,
    snapStrength: 5.5,
    cardRadius: 13.5,
    cardSpacing: 3.5,
    cardTilt: 1.3,
    cardElevate: 0.8,

    // Liquid & Shaders
    liquidDistortion: 1.4,
    chromaticAberration: 0.035,
    cardRippleSpeed: 3.2,

    // Lens & Post-processing
    bloomStrength: 0.5,
    bloomThreshold: 1.1,
    bloomRadius: 1.0,
    exposure: 0.95,
    grain: 0.045,
    vignette: 0.85,
    flashlight: 0.45,

    // Environment & Camera
    dustIntensity: 0.75,
    cameraSway: 0.8,
    fov: 42,

    // Pointer fluid simulation (drives post-process distortion)
    simRes: 128,
    dyeRes: 512,
    splatRadius: 0.25,
    splatForce: 3000,
    curl: 20,
    pressureIterations: 20,
    pressureDecay: 0.8,
    velocityDissipation: 0.6,
    dyeDissipation: 1.2
};

export const SCHEMA = {
    RibbonPhysics: {
        friction: [0.8, 0.98, 0.005],
        dragSpeed: [0.001, 0.01, 0.0005],
        wheelSpeed: [0.0005, 0.005, 0.0001],
        snapStrength: [1, 15, 0.5],
        cardTilt: [0, 3, 0.05],
        cardElevate: [0, 2, 0.05]
    },
    LiquidShaders: {
        liquidDistortion: [0, 3, 0.05],
        chromaticAberration: [0, 0.1, 0.002],
        cardRippleSpeed: [1, 10, 0.1]
    },
    PostProcessing: {
        bloomStrength: [0, 2, 0.02],
        bloomThreshold: [0.5, 2.5, 0.05],
        exposure: [0.5, 2, 0.02],
        grain: [0, 0.2, 0.002],
        vignette: [0, 1, 0.02],
        flashlight: [0, 1.5, 0.02]
    },
    Atmosphere: {
        dustIntensity: [0, 2, 0.02],
        cameraSway: [0, 2, 0.02],
        fov: [30, 65, 0.5]
    }
};
