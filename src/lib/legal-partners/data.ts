export interface LegalPartner {
  id: string;
  name: string;
  firm: string;
  category: "M&A Law" | "Tax & Structuring" | "Due Diligence & Accounting" | "Escrow & Contract Advisory";
  location: string;
  experienceYears: number;
  description: string;
  specialization: string[];
  contactEmail: string;
  feeStructure: string;
  verifiedBadge: boolean;
}

export const LEGAL_AND_CA_PARTNERS: LegalPartner[] = [
  {
    id: "lp-1",
    name: "Adv. Rohan Mehra",
    firm: "Mehra & Partners M&A Law Practice",
    category: "M&A Law",
    location: "Bengaluru, Karnataka",
    experienceYears: 14,
    description:
      "Specializes in micro-SaaS, B2B software, and IP cross-border transfer agreements. Over 80 completed Indian tech acquisitions.",
    specialization: [
      "Asset Purchase Agreements (APA)",
      "Share Purchase Agreements (SPA)",
      "IP Assignment & Trademark Deeds",
      "Confidentiality & Non-Compete Covenants",
    ],
    contactEmail: "rohan.mehra@lawpractice-partner.in",
    feeStructure: "Transparent flat retainer per transaction review (₹35,000 – ₹75,000)",
    verifiedBadge: true,
  },
  {
    id: "lp-2",
    name: "CA Priya Sundaram",
    firm: "Sundaram & Associates Chartered Accountants",
    category: "Tax & Structuring",
    location: "Mumbai, Maharashtra",
    experienceYears: 12,
    description:
      "Expert guidance on Section 50B Slump Sale tax implications, Capital Gains optimization, and GST liabilities during business asset transfer.",
    specialization: [
      "Slump Sale (Section 50B) Structuring",
      "Long-term vs Short-term Capital Gains Planning",
      "GST Nil-rated Asset Transfer Certification",
      "Form 15CA/CB for Foreign Buyer Remittances",
    ],
    contactEmail: "priya.sundaram@sundaram-ca.in",
    feeStructure: "Structured advisory per deal (₹25,000 – ₹50,000)",
    verifiedBadge: true,
  },
  {
    id: "lp-3",
    name: "Vikramaditya Rao, FCA",
    firm: "Rao Financial Advisory & Due Diligence",
    category: "Due Diligence & Accounting",
    location: "Delhi NCR (Gurugram)",
    experienceYears: 16,
    description:
      "Quality of Earnings (QoE) audits, statutory bank reconciliation, and third-party accounting validation for prospective buyers.",
    specialization: [
      "Quality of Earnings (QoE) Reports",
      "Bank Statement to P&L Reconciliation",
      "Cohort Churn & Customer Concentration Audit",
      "Vendor Debt & Liability Verification",
    ],
    contactEmail: "vikram@raofinancial.in",
    feeStructure: "Custom audit based on revenue tier (₹40,000 – ₹90,000)",
    verifiedBadge: true,
  },
  {
    id: "lp-4",
    name: "Adv. Sneha Deshmukh",
    firm: "Deshmukh Tech Legal Chambers",
    category: "Escrow & Contract Advisory",
    location: "Pune, Maharashtra / Remote",
    experienceYears: 10,
    description:
      "Dedicated representation for early-stage founders and single-founder digital assets. Assistance with escrow conditions and transition contracts.",
    specialization: [
      "Third-party Escrow Agreement Drafting",
      "Post-close Transition Period Milestones",
      "Employee / Contractor Retention Agreements",
      "Dispute Mitigation Clauses",
    ],
    contactEmail: "sneha@deshmukh-legal.in",
    feeStructure: "Fixed fee per closing checklist (₹20,000 – ₹45,000)",
    verifiedBadge: true,
  },
];
