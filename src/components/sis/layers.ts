// Source-faithful one-liners for the five SIS pillars (content/source/sovereign-intelligence-stack.md).
// Used instead of sisPages[].description, which contains wording the source does not support (e.g. "hybrid").
import { sisPages } from '../../data/site';

export const sisBlurbs: Record<string, string> = {
  Connectivity: 'Reliable, scalable connectivity that bridges regional networks with the global internet infrastructure.',
  'Data Center': 'Enterprise-grade, carrier-neutral facilities engineered for resilience, security and AI-ready workloads.',
  'Cloud Computing': 'Acme CloudHub private cloud: control, flexibility and performance in a vendor-neutral environment.',
  'Intelligent Automation': 'Cognitive workflows and self-evolving digital systems that turn operational friction into outcomes.',
  'Network Intelligence': 'Line-rate visibility, capacity optimization and security for high-density data streams, including DPI.',
};

export const pillars = sisPages.map((p) => ({ ...p, blurb: sisBlurbs[p.label] ?? p.description ?? '' }));
