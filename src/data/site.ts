// Single source for navigation and site-wide facts. Pages import from here; never hardcode nav links.

export type NavLink = { label: string; href: string; description?: string };
export type NavGroup = { label: string; href?: string; children: NavLink[] };

export const SIS_BASE = '/services/sovereign-intelligence-stack';

export const nav: (NavLink | NavGroup)[] = [
  { label: 'About', href: '/about' },
  {
    label: 'Services',
    children: [
      { label: 'Voice', href: '/services/voice', description: 'Wholesale voice, DID & toll-free, fraud management' },
      { label: 'Messaging', href: '/services/messaging', description: 'A2P, P2A, P2P, firewall, silent authentication' },
      { label: 'Sovereign Intelligence Stack', href: SIS_BASE, description: 'Connectivity, data center, cloud, AI, network intelligence' },
    ],
  },
  {
    label: 'Products',
    children: [
      { label: 'ACMeSIM', href: '/products/acmesim', description: 'Instant global eSIM for travellers and partners' },
      { label: 'SMS Firewall', href: '/services/messaging#firewall', description: 'Grey-route protection and SMS monetization' },
      { label: 'Fraud Management', href: '/services/voice#fraud-management', description: 'Real-time fraud detection and revenue assurance' },
      { label: 'Probe Testing', href: '/services/messaging#penetration-testing', description: 'Telecom network penetration testing' },
    ],
  },
];

export const sisPages: (NavLink & { icon: string })[] = [
  { label: 'Connectivity', href: `${SIS_BASE}/connectivity`, icon: 'network', description: 'Terrestrial and subsea wholesale capacity' },
  { label: 'Data Center', href: `${SIS_BASE}/data-center`, icon: 'server', description: 'Tier III/IV, carrier-neutral, AI-ready facilities' },
  { label: 'Cloud Computing', href: `${SIS_BASE}/cloud-computing`, icon: 'cloud', description: 'Public, private and hybrid sovereign cloud' },
  { label: 'Intelligent Automation', href: `${SIS_BASE}/intelligent-automation`, icon: 'cpu', description: 'AI-driven automation for operations' },
  { label: 'Network Intelligence', href: `${SIS_BASE}/network-intelligence`, icon: 'radar', description: 'DPI and real-time traffic insight' },
];

export const contact = {
  email: 'info@acmetel.com', // PLACEHOLDER: confirm with client
  cta: { label: 'Contact Us', href: '/contact' },
};

export const acmesimUrl = 'https://acmesim.global/';
export const acmesimStoreUrl = 'https://esim.acmesim.global/';
