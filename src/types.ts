export interface User {
  id: string;
  email: string;
  role: 'admin' | 'user';
  usageCount: number;
  isSubscribed: boolean;
  subscriptionType: 'none' | 'monthly' | 'yearly';
  createdAt: string;
  facebookApiKey?: string;
  googleAdsApiKey?: string;
  imageGenApiKey?: string;
  videoGenApiKey?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: string;
}

export interface CampaignData {
  platform: 'facebook' | 'google';
  campaignName: string;
  adHeadline: string;
  adBodyCopy: string;
  dailyBudget: number;
}

export interface SystemLog {
  id: string;
  userId?: string;
  userEmail?: string;
  action: string;
  details: string;
  timestamp: string;
}

export interface IntegrationStatus {
  facebook: {
    connected: boolean;
    maskedKey: string;
  };
  googleAds: {
    connected: boolean;
    maskedKey: string;
  };
  paymentSystem: {
    connected: boolean;
    maskedKey: string;
  };
  imageGen: {
    connected: boolean;
    maskedKey: string;
  };
  videoGen: {
    connected: boolean;
    maskedKey: string;
  };
}
