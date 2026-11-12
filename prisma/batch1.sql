-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RoleType" AS ENUM ('BUYER', 'SELLER', 'ADMIN', 'REVIEWER');

-- CreateEnum
CREATE TYPE "CurrencyCode" AS ENUM ('INR', 'USD', 'EUR', 'GBP');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'FLAGGED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MetricKey" AS ENUM ('REVENUE', 'PROFIT', 'GROWTH', 'CHURN', 'TRAFFIC', 'CUSTOMERS');

-- CreateEnum
CREATE TYPE "MetricUnit" AS ENUM ('CURRENCY', 'PERCENT', 'COUNT');

-- CreateEnum
CREATE TYPE "MetricSource" AS ENUM ('SELLER_REPORTED', 'STRIPE', 'RAZORPAY', 'GA4', 'PLAUSIBLE');

-- CreateEnum
CREATE TYPE "VerificationType" AS ENUM ('EMAIL', 'PHONE', 'DOMAIN', 'REVENUE', 'TRAFFIC', 'IDENTITY', 'PROOF_OF_FUNDS', 'PAYMENT_CONNECTOR', 'ANALYTICS_CONNECTOR');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'EXPIRED', 'FAILED', 'REVOKED');

-- CreateEnum
CREATE TYPE "DealStageType" AS ENUM ('INTERESTED', 'INTRODUCED', 'DETAILS_SHARED', 'OFFER_DISCUSSED', 'CLOSING', 'CLOSED_OR_WITHDRAWN', 'INTRO', 'NDA', 'DATA_ACCESS', 'OFFER', 'DUE_DILIGENCE', 'ESCROW', 'TRANSFER');

-- CreateEnum
CREATE TYPE "StageOwner" AS ENUM ('BUYER', 'SELLER', 'BOTH', 'ADMIN');

-- CreateEnum
CREATE TYPE "StageStatus" AS ENUM ('COMPLETED', 'ACTIVE', 'PENDING', 'BLOCKED');

-- CreateEnum
CREATE TYPE "DealRoomStatus" AS ENUM ('ACTIVE', 'CLOSED', 'WITHDRAWN', 'DISPUTED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VirusScanStatus" AS ENUM ('PENDING', 'CLEAN', 'INFECTED');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('PROPOSED', 'COUNTERED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ChecklistPhase" AS ENUM ('DUE_DILIGENCE', 'TRANSFER');

-- CreateEnum
CREATE TYPE "ChecklistStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "EscrowStatus" AS ENUM ('INITIATED', 'FUNDED', 'IN_REVIEW', 'RELEASED', 'DISPUTED', 'REFUNDED');

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" "RoleType" NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "oauthProvider" TEXT,
    "oauthSubject" TEXT,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorSecret" TEXT,
    "twoFactorVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyName" TEXT,
    "bio" TEXT,
    "minBudget" DECIMAL(18,2),
    "maxBudget" DECIMAL(18,2),
    "preferredCurrency" "CurrencyCode" NOT NULL DEFAULT 'INR',
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "identityStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "proofOfFundsStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuyerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyName" TEXT,
    "bio" TEXT,
    "payoutCountry" TEXT NOT NULL DEFAULT 'IN',
    "identityStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Thesis" (
    "id" TEXT NOT NULL,
    "buyerProfileId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sector" TEXT,
    "minRevenue" DECIMAL(18,2),
    "maxRevenue" DECIMAL(18,2),
    "minProfit" DECIMAL(18,2),
    "maxOwnerHours" INTEGER,
    "geography" TEXT,
    "minPrice" DECIMAL(18,2),
    "maxPrice" DECIMAL(18,2),
    "currency" "CurrencyCode" NOT NULL DEFAULT 'INR',
    "freeText" TEXT NOT NULL DEFAULT '',
    "alertsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isSampleData" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Thesis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Business" (
    "id" TEXT NOT NULL,
    "sellerProfileId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "teaserTitle" TEXT NOT NULL,
    "teaserSummary" TEXT NOT NULL DEFAULT '',
    "redactedName" TEXT NOT NULL,
    "redactedDomain" TEXT NOT NULL,
    "redactedCustomers" TEXT,
    "sector" TEXT NOT NULL,
    "geography" TEXT NOT NULL,
    "askingPrice" DECIMAL(18,2) NOT NULL,
    "currency" "CurrencyCode" NOT NULL DEFAULT 'INR',
    "ownerHoursPerWeek" INTEGER NOT NULL,
    "reasonForSelling" TEXT NOT NULL,
    "founderStory" TEXT NOT NULL DEFAULT '',
    "founderMediaUrl" TEXT,
    "founderMediaType" TEXT,
    "financialNarrative" TEXT NOT NULL,
    "financialSeriesJson" JSONB,
    "risksSummary" TEXT NOT NULL,
    "techStack" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "assetsIncluded" TEXT[],
    "valuationLow" DECIMAL(18,2),
    "valuationHigh" DECIMAL(18,2),
    "valuationBasis" TEXT,
    "status" "ListingStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewerNote" TEXT,
    "isSampleData" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingQuestion" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "askerId" TEXT,
    "askerLabel" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "answeredAt" TIMESTAMP(3),
    "isSampleData" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListingQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessMetric" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "key" "MetricKey" NOT NULL,
    "label" TEXT NOT NULL,
    "value" DECIMAL(18,2) NOT NULL,
    "unit" "MetricUnit" NOT NULL,
    "currency" "CurrencyCode",
    "source" "MetricSource" NOT NULL DEFAULT 'SELLER_REPORTED',
    "verificationId" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "isSampleData" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "businessId" TEXT,
    "type" "VerificationType" NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "thesisId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "reasonsJson" JSONB NOT NULL,
    "mismatchesJson" JSONB NOT NULL,
    "alertSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable