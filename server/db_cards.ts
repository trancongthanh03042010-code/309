import crypto from 'crypto';
import type Database from 'better-sqlite3';

export type BankBrandId = 'hikari' | 'sakura' | 'akuma' | 'tsuki' | 'aoi';
export type CardTierId = 'standard' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'infinite';
export type CardCategory = 'debit' | 'credit';

export const CARD_TIER_ORDER: CardTierId[] = [
  'standard',
  'silver',
  'gold',
  'platinum',
  'diamond',
  'infinite',
];

export const CARD_TIER_LABELS: Record<CardTierId, string> = {
  standard: 'Standard',
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
  diamond: 'Diamond',
  infinite: 'Infinite',
};

export interface CardTierUpgradeReq {
  minLinkedBalance: number;
  minTotalAssets: number;
  minCardSpend: number;
  minTxCount: number;
  minRewardPoints: number;
  minCardAgeDays: number;
}

export interface CardTierPolicy {
  tier: CardTierId;
  tierLabel: string;
  cardTitle: string;
  cashbackRate: number;
  interestRate: number;
  txFeePct: number;
  fixedTxFee: number;
  withdrawFee: number;
  intlFeePct: number;
  maintenanceFee: number;
  rewardPointRate: number; // points per 100.000đ
  perTxLimit: number;
  dailyLimit: number;
  monthlyLimit: number;
  transferLimit: number;
  withdrawLimit: number;
  onlineLimit: number;
  cashbackCapMonth: number;
  interestBalanceCap: number;
  creditLimit: number;
  designTheme: string;
  benefits: string[];
  upgradeReq: CardTierUpgradeReq;
  issueUnlockReq: {
    minBalance: number;
    minTotalAssets: number;
  };
}

export interface AnimeBankDefinition {
  id: BankBrandId;
  name: string;
  jpName: string;
  shortCode: string;
  tagline: string;
  specialty: string;
  networkBrand: string;
  binPrefix: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  logoVariant: BankBrandId;
  sortOrder: number;
  tierPolicies: Record<CardTierId, CardTierPolicy>;
}

const STANDARD_ISSUE_FREE = { minBalance: 0, minTotalAssets: 0 };

function makeUpgradeReq(tier: CardTierId): CardTierUpgradeReq {
  switch (tier) {
    case 'standard':
      return {
        minLinkedBalance: 0,
        minTotalAssets: 0,
        minCardSpend: 0,
        minTxCount: 0,
        minRewardPoints: 0,
        minCardAgeDays: 0,
      };
    case 'silver':
      return {
        minLinkedBalance: 5_000_000,
        minTotalAssets: 5_000_000,
        minCardSpend: 500_000,
        minTxCount: 1,
        minRewardPoints: 10,
        minCardAgeDays: 0,
      };
    case 'gold':
      return {
        minLinkedBalance: 15_000_000,
        minTotalAssets: 20_000_000,
        minCardSpend: 2_000_000,
        minTxCount: 2,
        minRewardPoints: 30,
        minCardAgeDays: 0,
      };
    case 'platinum':
      return {
        minLinkedBalance: 30_000_000,
        minTotalAssets: 50_000_000,
        minCardSpend: 5_000_000,
        minTxCount: 3,
        minRewardPoints: 60,
        minCardAgeDays: 0,
      };
    case 'diamond':
      return {
        minLinkedBalance: 60_000_000,
        minTotalAssets: 120_000_000,
        minCardSpend: 12_000_000,
        minTxCount: 5,
        minRewardPoints: 120,
        minCardAgeDays: 0,
      };
    case 'infinite':
      return {
        minLinkedBalance: 100_000_000,
        minTotalAssets: 250_000_000,
        minCardSpend: 25_000_000,
        minTxCount: 8,
        minRewardPoints: 250,
        minCardAgeDays: 0,
      };
  }
}

export const ANIME_CARD_BANKS: AnimeBankDefinition[] = [
  {
    id: 'hikari',
    name: 'Hikari Bank',
    jpName: 'ひかり銀行',
    shortCode: 'HKR',
    tagline: 'Ánh sáng tài chính · Thanh toán cân bằng 24/7',
    specialty: 'Hoàn tiền toàn diện, miễn phí chuyển khoản từ hạng Gold',
    networkBrand: 'HIKARI PAY',
    binPrefix: '9704',
    primaryColor: '#E14B5A',
    secondaryColor: '#8F1D30',
    accentColor: '#FDE047',
    logoVariant: 'hikari',
    sortOrder: 1,
    tierPolicies: {
      standard: {
        tier: 'standard',
        tierLabel: 'Standard',
        cardTitle: 'Hikari Standard Dawn',
        cashbackRate: 0.3,
        interestRate: 0,
        txFeePct: 0.3,
        fixedTxFee: 0,
        withdrawFee: 5500,
        intlFeePct: 2.5,
        maintenanceFee: 0,
        rewardPointRate: 1.0,
        perTxLimit: 20_000_000,
        dailyLimit: 50_000_000,
        monthlyLimit: 200_000_000,
        transferLimit: 50_000_000,
        withdrawLimit: 20_000_000,
        onlineLimit: 30_000_000,
        cashbackCapMonth: 600_000,
        interestBalanceCap: 0,
        creditLimit: 0,
        designTheme: 'coral',
        benefits: ['Hoàn tiền 0.3% mọi thanh toán & hóa đơn', 'Tích 1 điểm / 100.000đ', 'Miễn phí phát hành & duy trì'],
        upgradeReq: makeUpgradeReq('standard'),
        issueUnlockReq: STANDARD_ISSUE_FREE,
      },
      silver: {
        tier: 'silver',
        tierLabel: 'Silver',
        cardTitle: 'Hikari Silver Horizon',
        cashbackRate: 0.6,
        interestRate: 1.2,
        txFeePct: 0.2,
        fixedTxFee: 0,
        withdrawFee: 3300,
        intlFeePct: 2.0,
        maintenanceFee: 0,
        rewardPointRate: 1.3,
        perTxLimit: 35_000_000,
        dailyLimit: 70_000_000,
        monthlyLimit: 280_000_000,
        transferLimit: 70_000_000,
        withdrawLimit: 30_000_000,
        onlineLimit: 50_000_000,
        cashbackCapMonth: 1_500_000,
        interestBalanceCap: 100_000_000,
        creditLimit: 30_000_000,
        designTheme: 'coral_silver',
        benefits: ['Hoàn tiền 0.6% mọi chi tiêu', 'Lãi suất 1.2%/năm trên số dư liên kết', 'Giảm 40% phí rút ATM'],
        upgradeReq: makeUpgradeReq('silver'),
        issueUnlockReq: { minBalance: 5_000_000, minTotalAssets: 5_000_000 },
      },
      gold: {
        tier: 'gold',
        tierLabel: 'Gold',
        cardTitle: 'Hikari Gold Solaris',
        cashbackRate: 1.2,
        interestRate: 2.2,
        txFeePct: 0.1,
        fixedTxFee: 0,
        withdrawFee: 0,
        intlFeePct: 1.5,
        maintenanceFee: 0,
        rewardPointRate: 1.8,
        perTxLimit: 60_000_000,
        dailyLimit: 120_000_000,
        monthlyLimit: 450_000_000,
        transferLimit: 120_000_000,
        withdrawLimit: 50_000_000,
        onlineLimit: 90_000_000,
        cashbackCapMonth: 3_000_000,
        interestBalanceCap: 200_000_000,
        creditLimit: 80_000_000,
        designTheme: 'hikari_gold',
        benefits: ['Hoàn tiền 1.2% + ưu đãi đối tác', 'Lãi suất 2.2%/năm', 'Miễn phí rút tiền ATM toàn hệ thống'],
        upgradeReq: makeUpgradeReq('gold'),
        issueUnlockReq: { minBalance: 15_000_000, minTotalAssets: 25_000_000 },
      },
      platinum: {
        tier: 'platinum',
        tierLabel: 'Platinum',
        cardTitle: 'Hikari Platinum Crest',
        cashbackRate: 2.2,
        interestRate: 3.4,
        txFeePct: 0,
        fixedTxFee: 0,
        withdrawFee: 0,
        intlFeePct: 0.9,
        maintenanceFee: 0,
        rewardPointRate: 2.5,
        perTxLimit: 100_000_000,
        dailyLimit: 200_000_000,
        monthlyLimit: 800_000_000,
        transferLimit: 200_000_000,
        withdrawLimit: 80_000_000,
        onlineLimit: 150_000_000,
        cashbackCapMonth: 5_000_000,
        interestBalanceCap: 400_000_000,
        creditLimit: 150_000_000,
        designTheme: 'hikari_platinum',
        benefits: ['Hoàn tiền 2.2% không giới hạn danh mục', 'Miễn 100% phí giao dịch & Hỏa tốc', 'Lãi suất 3.4%/năm · 2.5x điểm thưởng'],
        upgradeReq: makeUpgradeReq('platinum'),
        issueUnlockReq: { minBalance: 35_000_000, minTotalAssets: 60_000_000 },
      },
      diamond: {
        tier: 'diamond',
        tierLabel: 'Diamond',
        cardTitle: 'Hikari Diamond Sovereign',
        cashbackRate: 4.0,
        interestRate: 4.8,
        txFeePct: 0,
        fixedTxFee: 0,
        withdrawFee: 0,
        intlFeePct: 0.4,
        maintenanceFee: 0,
        rewardPointRate: 3.5,
        perTxLimit: 200_000_000,
        dailyLimit: 400_000_000,
        monthlyLimit: 1_500_000_000,
        transferLimit: 400_000_000,
        withdrawLimit: 150_000_000,
        onlineLimit: 300_000_000,
        cashbackCapMonth: 10_000_000,
        interestBalanceCap: 800_000_000,
        creditLimit: 300_000_000,
        designTheme: 'hikari_diamond',
        benefits: ['Hoàn tiền 4.0% + VIP Lounge Tokyo', 'Lãi suất 4.8%/năm', 'Miễn phí chuyển tiền & Ưu tiên xử lý'],
        upgradeReq: makeUpgradeReq('diamond'),
        issueUnlockReq: { minBalance: 80_000_000, minTotalAssets: 150_000_000 },
      },
      infinite: {
        tier: 'infinite',
        tierLabel: 'Infinite',
        cardTitle: 'Hikari Solar Infinite',
        cashbackRate: 6.5,
        interestRate: 6.2,
        txFeePct: 0,
        fixedTxFee: 0,
        withdrawFee: 0,
        intlFeePct: 0,
        maintenanceFee: 0,
        rewardPointRate: 5.0,
        perTxLimit: 500_000_000,
        dailyLimit: 1_000_000_000,
        monthlyLimit: 5_000_000_000,
        transferLimit: 1_000_000_000,
        withdrawLimit: 300_000_000,
        onlineLimit: 800_000_000,
        cashbackCapMonth: 25_000_000,
        interestBalanceCap: 2_000_000_000,
        creditLimit: 800_000_000,
        designTheme: 'hikari_infinite',
        benefits: ['Hoàn tiền tối đa 6.5% mọi chi tiêu', 'Lãi suất đặc biệt 6.2%/năm', '5x Điểm thưởng · Miễn mọi loại phí trọn đời'],
        upgradeReq: makeUpgradeReq('infinite'),
        issueUnlockReq: { minBalance: 180_000_000, minTotalAssets: 350_000_000 },
      },
    },
  },
  {
    id: 'sakura',
    name: 'Sakura Bank',
    jpName: 'さくら銀行',
    shortCode: 'SKR',
    tagline: 'Mua sắm, Café & Thời trang · Thưởng điểm ngọt ngào',
    specialty: 'Cashback cao nhất ngành Ăn uống & Mua sắm, nhiều voucher',
    networkBrand: 'SAKURA PASS',
    binPrefix: '5421',
    primaryColor: '#EC4899',
    secondaryColor: '#9D174D',
    accentColor: '#FBCFE8',
    logoVariant: 'sakura',
    sortOrder: 2,
    tierPolicies: {
      standard: {
        tier: 'standard',
        tierLabel: 'Standard',
        cardTitle: 'Sakura Petal Basic',
        cashbackRate: 0.4,
        interestRate: 0.5,
        txFeePct: 0.25,
        fixedTxFee: 0,
        withdrawFee: 4400,
        intlFeePct: 2.2,
        maintenanceFee: 0,
        rewardPointRate: 1.2,
        perTxLimit: 18_000_000,
        dailyLimit: 40_000_000,
        monthlyLimit: 160_000_000,
        transferLimit: 40_000_000,
        withdrawLimit: 15_000_000,
        onlineLimit: 30_000_000,
        cashbackCapMonth: 800_000,
        interestBalanceCap: 50_000_000,
        creditLimit: 0,
        designTheme: 'sakura_std',
        benefits: ['Hoàn tiền 0.4% mọi chi tiêu & café', 'Lãi suất khởi đầu 0.5%/năm', '1.2x điểm thưởng mua sắm'],
        upgradeReq: makeUpgradeReq('standard'),
        issueUnlockReq: STANDARD_ISSUE_FREE,
      },
      silver: {
        tier: 'silver',
        tierLabel: 'Silver',
        cardTitle: 'Sakura Silver Bloom',
        cashbackRate: 0.8,
        interestRate: 1.5,
        txFeePct: 0.15,
        fixedTxFee: 0,
        withdrawFee: 2200,
        intlFeePct: 1.8,
        maintenanceFee: 0,
        rewardPointRate: 1.6,
        perTxLimit: 30_000_000,
        dailyLimit: 65_000_000,
        monthlyLimit: 250_000_000,
        transferLimit: 65_000_000,
        withdrawLimit: 25_000_000,
        onlineLimit: 50_000_000,
        cashbackCapMonth: 2_000_000,
        interestBalanceCap: 100_000_000,
        creditLimit: 40_000_000,
        designTheme: 'sakura_silver',
        benefits: ['Hoàn tiền 0.8% mọi hóa đơn', 'Lãi suất 1.5%/năm', '1.6x điểm thưởng thời trang & café'],
        upgradeReq: makeUpgradeReq('silver'),
        issueUnlockReq: { minBalance: 4_000_000, minTotalAssets: 4_000_000 },
      },
      gold: {
        tier: 'gold',
        tierLabel: 'Gold',
        cardTitle: 'Sakura Rose Gold',
        cashbackRate: 1.5,
        interestRate: 2.5,
        txFeePct: 0.05,
        fixedTxFee: 0,
        withdrawFee: 0,
        intlFeePct: 1.2,
        maintenanceFee: 0,
        rewardPointRate: 2.2,
        perTxLimit: 55_000_000,
        dailyLimit: 110_000_000,
        monthlyLimit: 420_000_000,
        transferLimit: 110_000_000,
        withdrawLimit: 40_000_000,
        onlineLimit: 90_000_000,
        cashbackCapMonth: 3_500_000,
        interestBalanceCap: 200_000_000,
        creditLimit: 90_000_000,
        designTheme: 'sakura_gold',
        benefits: ['Hoàn tiền 1.5% + tặng voucher mua sắm', 'Lãi suất 2.5%/năm', 'Miễn phí rút ATM & Online'],
        upgradeReq: makeUpgradeReq('gold'),
        issueUnlockReq: { minBalance: 12_000_000, minTotalAssets: 20_000_000 },
      },
      platinum: {
        tier: 'platinum',
        tierLabel: 'Platinum',
        cardTitle: 'Sakura Anime Platinum',
        cashbackRate: 2.8,
        interestRate: 3.6,
        txFeePct: 0,
        fixedTxFee: 0,
        withdrawFee: 0,
        intlFeePct: 0.8,
        maintenanceFee: 0,
        rewardPointRate: 3.0,
        perTxLimit: 90_000_000,
        dailyLimit: 180_000_000,
        monthlyLimit: 700_000_000,
        transferLimit: 180_000_000,
        withdrawLimit: 70_000_000,
        onlineLimit: 150_000_000,
        cashbackCapMonth: 6_000_000,
        interestBalanceCap: 400_000_000,
        creditLimit: 160_000_000,
        designTheme: 'sakura_platinum',
        benefits: ['Hoàn tiền 2.8% siêu hấp dẫn', 'Miễn phí giao dịch 100%', 'Lãi suất 3.6%/năm · 3x điểm thưởng'],
        upgradeReq: makeUpgradeReq('platinum'),
        issueUnlockReq: { minBalance: 30_000_000, minTotalAssets: 55_000_000 },
      },
      diamond: {
        tier: 'diamond',
        tierLabel: 'Diamond',
        cardTitle: 'Sakura Crystal Diamond',
        cashbackRate: 4.5,
        interestRate: 5.0,
        txFeePct: 0,
        fixedTxFee: 0,
        withdrawFee: 0,
        intlFeePct: 0.3,
        maintenanceFee: 0,
        rewardPointRate: 4.0,
        perTxLimit: 180_000_000,
        dailyLimit: 350_000_000,
        monthlyLimit: 1_200_000_000,
        transferLimit: 350_000_000,
        withdrawLimit: 120_000_000,
        onlineLimit: 280_000_000,
        cashbackCapMonth: 12_000_000,
        interestBalanceCap: 800_000_000,
        creditLimit: 320_000_000,
        designTheme: 'sakura_diamond',
        benefits: ['Hoàn tiền 4.5% đối tác Thời trang & Ẩm thực', 'Lãi suất 5.0%/năm', 'Quà tặng sinh nhật & 4x điểm'],
        upgradeReq: makeUpgradeReq('diamond'),
        issueUnlockReq: { minBalance: 75_000_000, minTotalAssets: 140_000_000 },
      },
      infinite: {
        tier: 'infinite',
        tierLabel: 'Infinite',
        cardTitle: 'Sakura Imperial Bloom',
        cashbackRate: 7.0,
        interestRate: 5.8,
        txFeePct: 0,
        fixedTxFee: 0,
        withdrawFee: 0,
        intlFeePct: 0,
        maintenanceFee: 0,
        rewardPointRate: 5.5,
        perTxLimit: 450_000_000,
        dailyLimit: 900_000_000,
        monthlyLimit: 4_000_000_000,
        transferLimit: 900_000_000,
        withdrawLimit: 250_000_000,
        onlineLimit: 700_000_000,
        cashbackCapMonth: 30_000_000,
        interestBalanceCap: 1_500_000_000,
        creditLimit: 750_000_000,
        designTheme: 'sakura_infinite',
        benefits: ['Hoàn tiền 7.0% mọi giao dịch thương mại', '5.5x điểm đổi quà độc quyền', 'Đặc quyền VIP Shibuya & Ginza'],
        upgradeReq: makeUpgradeReq('infinite'),
        issueUnlockReq: { minBalance: 160_000_000, minTotalAssets: 320_000_000 },
      },
    },
  },
  {
    id: 'akuma',
    name: 'Akuma Financial',
    jpName: 'アクマ金融',
    shortCode: 'AKM',
    tagline: 'Hạn mức khổng lồ · Hoàn tiền cực đại cho giao dịch lớn',
    specialty: 'Hạn mức thanh toán cao nhất + Cashback VIP tới 8%',
    networkBrand: 'AKUMA BLACK',
    binPrefix: '5299',
    primaryColor: '#DC2626',
    secondaryColor: '#0F172A',
    accentColor: '#F87171',
    logoVariant: 'akuma',
    sortOrder: 3,
    tierPolicies: {
      standard: {
        tier: 'standard',
        tierLabel: 'Standard',
        cardTitle: 'Akuma Ember Standard',
        cashbackRate: 0.2,
        interestRate: 0,
        txFeePct: 0.4,
        fixedTxFee: 1100,
        withdrawFee: 6600,
        intlFeePct: 2.8,
        maintenanceFee: 0,
        rewardPointRate: 1.0,
        perTxLimit: 30_000_000,
        dailyLimit: 60_000_000,
        monthlyLimit: 250_000_000,
        transferLimit: 60_000_000,
        withdrawLimit: 25_000_000,
        onlineLimit: 40_000_000,
        cashbackCapMonth: 600_000,
        interestBalanceCap: 0,
        creditLimit: 20_000_000,
        designTheme: 'akuma_std',
        benefits: ['Hoàn tiền 0.2% mọi giao dịch thanh toán', 'Hạn mức giao dịch cao từ ngày đầu', 'Tín dụng dự phòng 20tr'],
        upgradeReq: makeUpgradeReq('standard'),
        issueUnlockReq: STANDARD_ISSUE_FREE,
      },
      silver: {
        tier: 'silver',
        tierLabel: 'Silver',
        cardTitle: 'Akuma Crimson Silver',
        cashbackRate: 0.5,
        interestRate: 0.8,
        txFeePct: 0.25,
        fixedTxFee: 0,
        withdrawFee: 3300,
        intlFeePct: 2.2,
        maintenanceFee: 0,
        rewardPointRate: 1.4,
        perTxLimit: 50_000_000,
        dailyLimit: 100_000_000,
        monthlyLimit: 400_000_000,
        transferLimit: 100_000_000,
        withdrawLimit: 40_000_000,
        onlineLimit: 80_000_000,
        cashbackCapMonth: 2_000_000,
        interestBalanceCap: 100_000_000,
        creditLimit: 50_000_000,
        designTheme: 'akuma_silver',
        benefits: ['Hoàn tiền 0.5% + hạn mức 100tr/ngày', 'Lãi suất 0.8%/năm', 'Giảm 50% phí rút ATM'],
        upgradeReq: makeUpgradeReq('silver'),
        issueUnlockReq: { minBalance: 6_000_000, minTotalAssets: 8_000_000 },
      },
      gold: {
        tier: 'gold',
        tierLabel: 'Gold',
        cardTitle: 'Akuma Ruby Gold',
        cashbackRate: 1.4,
        interestRate: 1.8,
        txFeePct: 0.1,
        fixedTxFee: 0,
        withdrawFee: 0,
        intlFeePct: 1.6,
        maintenanceFee: 0,
        rewardPointRate: 2.0,
        perTxLimit: 100_000_000,
        dailyLimit: 200_000_000,
        monthlyLimit: 700_000_000,
        transferLimit: 200_000_000,
        withdrawLimit: 75_000_000,
        onlineLimit: 150_000_000,
        cashbackCapMonth: 4_500_000,
        interestBalanceCap: 250_000_000,
        creditLimit: 120_000_000,
        designTheme: 'akuma_gold',
        benefits: ['Hoàn tiền 1.4% mọi chi tiêu lớn', 'Hạn mức 200tr/ngày', 'Miễn phí rút ATM toàn quốc'],
        upgradeReq: makeUpgradeReq('gold'),
        issueUnlockReq: { minBalance: 18_000_000, minTotalAssets: 30_000_000 },
      },
      platinum: {
        tier: 'platinum',
        tierLabel: 'Platinum',
        cardTitle: 'Akuma Obsidian Platinum',
        cashbackRate: 2.5,
        interestRate: 3.0,
        txFeePct: 0,
        fixedTxFee: 0,
        withdrawFee: 0,
        intlFeePct: 1.0,
        maintenanceFee: 0,
        rewardPointRate: 2.8,
        perTxLimit: 180_000_000,
        dailyLimit: 350_000_000,
        monthlyLimit: 1_200_000_000,
        transferLimit: 350_000_000,
        withdrawLimit: 120_000_000,
        onlineLimit: 250_000_000,
        cashbackCapMonth: 8_000_000,
        interestBalanceCap: 500_000_000,
        creditLimit: 250_000_000,
        designTheme: 'akuma_platinum',
        benefits: ['Hoàn tiền 2.5% · 2.8x điểm', 'Miễn mọi phí chuyển & thanh toán', 'Hạn mức 350tr/ngày'],
        upgradeReq: makeUpgradeReq('platinum'),
        issueUnlockReq: { minBalance: 40_000_000, minTotalAssets: 75_000_000 },
      },
      diamond: {
        tier: 'diamond',
        tierLabel: 'Diamond',
        cardTitle: 'Akuma Nocturne Diamond',
        cashbackRate: 5.0,
        interestRate: 4.5,
        txFeePct: 0,
        fixedTxFee: 0,
        withdrawFee: 0,
        intlFeePct: 0.4,
        maintenanceFee: 0,
        rewardPointRate: 4.0,
        perTxLimit: 300_000_000,
        dailyLimit: 600_000_000,
        monthlyLimit: 2_500_000_000,
        transferLimit: 600_000_000,
        withdrawLimit: 200_000_000,
        onlineLimit: 500_000_000,
        cashbackCapMonth: 18_000_000,
        interestBalanceCap: 1_000_000_000,
        creditLimit: 500_000_000,
        designTheme: 'akuma_diamond',
        benefits: ['Hoàn tiền VIP 5.0%!', 'Lãi suất 4.5%/năm · Tín dụng 500tr', 'Hạn mức 600tr/ngày'],
        upgradeReq: makeUpgradeReq('diamond'),
        issueUnlockReq: { minBalance: 90_000_000, minTotalAssets: 180_000_000 },
      },
      infinite: {
        tier: 'infinite',
        tierLabel: 'Infinite',
        cardTitle: 'Akuma Abyssal Infinite',
        cashbackRate: 8.0,
        interestRate: 6.5,
        txFeePct: 0,
        fixedTxFee: 0,
        withdrawFee: 0,
        intlFeePct: 0,
        maintenanceFee: 0,
        rewardPointRate: 6.0,
        perTxLimit: 800_000_000,
        dailyLimit: 1_500_000_000,
        monthlyLimit: 8_000_000_000,
        transferLimit: 1_500_000_000,
        withdrawLimit: 500_000_000,
        onlineLimit: 1_200_000_000,
        cashbackCapMonth: 45_000_000,
        interestBalanceCap: 3_000_000_000,
        creditLimit: 1_500_000_000,
        designTheme: 'akuma_infinite',
        benefits: ['Hoàn tiền tối đa 8.0% độc quyền', 'Lãi suất 6.5%/năm · 6x điểm thưởng', 'Hạn mức tối thượng 1.5 tỷ/ngày'],
        upgradeReq: makeUpgradeReq('infinite'),
        issueUnlockReq: { minBalance: 220_000_000, minTotalAssets: 450_000_000 },
      },
    },
  },
  {
    id: 'tsuki',
    name: 'Tsuki Bank',
    jpName: '月銀行',
    shortCode: 'TSK',
    tagline: 'Lãi suất vượt trội · Đặc quyền Du lịch & Đêm Tokyo',
    specialty: 'Lãi suất thẻ cao nhất (lên tới 7.2%/năm) & ưu đãi Du lịch 10%',
    networkBrand: 'TSUKI PRIME',
    binPrefix: '4895',
    primaryColor: '#4F46E5',
    secondaryColor: '#0F172A',
    accentColor: '#C4B5FD',
    logoVariant: 'tsuki',
    sortOrder: 4,
    tierPolicies: {
      standard: {
        tier: 'standard',
        tierLabel: 'Standard',
        cardTitle: 'Tsuki Crescent Standard',
        cashbackRate: 0.25,
        interestRate: 0.8,
        txFeePct: 0.25,
        fixedTxFee: 0,
        withdrawFee: 4400,
        intlFeePct: 2.0,
        maintenanceFee: 0,
        rewardPointRate: 1.0,
        perTxLimit: 20_000_000,
        dailyLimit: 45_000_000,
        monthlyLimit: 180_000_000,
        transferLimit: 45_000_000,
        withdrawLimit: 20_000_000,
        onlineLimit: 35_000_000,
        cashbackCapMonth: 500_000,
        interestBalanceCap: 80_000_000,
        creditLimit: 0,
        designTheme: 'tsuki_std',
        benefits: ['Hoàn tiền 0.25% thanh toán nội địa & quốc tế', 'Lãi suất ngay từ hạng Standard (0.8%/năm)', 'Phí ngoại tệ ưu đãi 2.0%'],
        upgradeReq: makeUpgradeReq('standard'),
        issueUnlockReq: STANDARD_ISSUE_FREE,
      },
      silver: {
        tier: 'silver',
        tierLabel: 'Silver',
        cardTitle: 'Tsuki Moonlight Silver',
        cashbackRate: 0.5,
        interestRate: 1.8,
        txFeePct: 0.15,
        fixedTxFee: 0,
        withdrawFee: 2200,
        intlFeePct: 1.4,
        maintenanceFee: 0,
        rewardPointRate: 1.3,
        perTxLimit: 35_000_000,
        dailyLimit: 70_000_000,
        monthlyLimit: 260_000_000,
        transferLimit: 70_000_000,
        withdrawLimit: 30_000_000,
        onlineLimit: 55_000_000,
        cashbackCapMonth: 1_500_000,
        interestBalanceCap: 150_000_000,
        creditLimit: 30_000_000,
        designTheme: 'tsuki_silver',
        benefits: ['Lãi suất 1.8%/năm trên số dư', 'Hoàn tiền 0.5% mọi chi tiêu', 'Ưu đãi du lịch & khách sạn'],
        upgradeReq: makeUpgradeReq('silver'),
        issueUnlockReq: { minBalance: 5_000_000, minTotalAssets: 5_000_000 },
      },
      gold: {
        tier: 'gold',
        tierLabel: 'Gold',
        cardTitle: 'Tsuki Starlight Gold',
        cashbackRate: 1.0,
        interestRate: 2.8,
        txFeePct: 0.05,
        fixedTxFee: 0,
        withdrawFee: 0,
        intlFeePct: 0.9,
        maintenanceFee: 0,
        rewardPointRate: 1.8,
        perTxLimit: 60_000_000,
        dailyLimit: 120_000_000,
        monthlyLimit: 450_000_000,
        transferLimit: 120_000_000,
        withdrawLimit: 45_000_000,
        onlineLimit: 90_000_000,
        cashbackCapMonth: 3_000_000,
        interestBalanceCap: 300_000_000,
        creditLimit: 80_000_000,
        designTheme: 'tsuki_gold',
        benefits: ['Lãi suất cao 2.8%/năm', 'Hoàn tiền 1.0% + Du lịch 10% YumeTravel', 'Miễn phí rút ATM'],
        upgradeReq: makeUpgradeReq('gold'),
        issueUnlockReq: { minBalance: 15_000_000, minTotalAssets: 25_000_000 },
      },
      platinum: {
        tier: 'platinum',
        tierLabel: 'Platinum',
        cardTitle: 'Tsuki Nebula Platinum',
        cashbackRate: 2.0,
        interestRate: 4.2,
        txFeePct: 0,
        fixedTxFee: 0,
        withdrawFee: 0,
        intlFeePct: 0.4,
        maintenanceFee: 0,
        rewardPointRate: 2.5,
        perTxLimit: 100_000_000,
        dailyLimit: 200_000_000,
        monthlyLimit: 800_000_000,
        transferLimit: 200_000_000,
        withdrawLimit: 80_000_000,
        onlineLimit: 160_000_000,
        cashbackCapMonth: 5_500_000,
        interestBalanceCap: 600_000_000,
        creditLimit: 180_000_000,
        designTheme: 'tsuki_platinum',
        benefits: ['Lãi suất 4.2%/năm vượt trội', 'Miễn phí chuyển & thanh toán', 'Phí ngoại tệ chỉ 0.4%'],
        upgradeReq: makeUpgradeReq('platinum'),
        issueUnlockReq: { minBalance: 35_000_000, minTotalAssets: 60_000_000 },
      },
      diamond: {
        tier: 'diamond',
        tierLabel: 'Diamond',
        cardTitle: 'Tsuki Celestial Diamond',
        cashbackRate: 3.5,
        interestRate: 5.5,
        txFeePct: 0,
        fixedTxFee: 0,
        withdrawFee: 0,
        intlFeePct: 0,
        maintenanceFee: 0,
        rewardPointRate: 3.5,
        perTxLimit: 200_000_000,
        dailyLimit: 400_000_000,
        monthlyLimit: 1_500_000_000,
        transferLimit: 400_000_000,
        withdrawLimit: 150_000_000,
        onlineLimit: 320_000_000,
        cashbackCapMonth: 10_000_000,
        interestBalanceCap: 1_200_000_000,
        creditLimit: 350_000_000,
        designTheme: 'tsuki_diamond',
        benefits: ['Lãi suất 5.5%/năm cho số dư tới 1.2 tỷ', 'Hoàn tiền 3.5% · Miễn 100% phí ngoại tệ', 'Bảo hiểm du lịch toàn cầu'],
        upgradeReq: makeUpgradeReq('diamond'),
        issueUnlockReq: { minBalance: 80_000_000, minTotalAssets: 160_000_000 },
      },
      infinite: {
        tier: 'infinite',
        tierLabel: 'Infinite',
        cardTitle: 'Tsuki Eclipse Infinite',
        cashbackRate: 5.5,
        interestRate: 7.2,
        txFeePct: 0,
        fixedTxFee: 0,
        withdrawFee: 0,
        intlFeePct: 0,
        maintenanceFee: 0,
        rewardPointRate: 5.0,
        perTxLimit: 500_000_000,
        dailyLimit: 1_000_000_000,
        monthlyLimit: 5_000_000_000,
        transferLimit: 1_000_000_000,
        withdrawLimit: 300_000_000,
        onlineLimit: 800_000_000,
        cashbackCapMonth: 25_000_000,
        interestBalanceCap: 3_000_000_000,
        creditLimit: 900_000_000,
        designTheme: 'tsuki_infinite',
        benefits: ['Lãi suất kỷ lục 7.2%/năm theo kỳ!', 'Hoàn tiền 5.5% · Miễn phí mọi giao dịch quốc tế', 'Phòng chờ sân bay không giới hạn'],
        upgradeReq: makeUpgradeReq('infinite'),
        issueUnlockReq: { minBalance: 180_000_000, minTotalAssets: 350_000_000 },
      },
    },
  },
  {
    id: 'aoi',
    name: 'Aoi Capital',
    jpName: 'アオイキャピタル',
    shortCode: 'AOI',
    tagline: 'Phí thấp nhất · Tích điểm thưởng siêu tốc',
    specialty: 'Miễn phí từ Silver & Tỷ lệ tích điểm thưởng cao nhất',
    networkBrand: 'AOI GLOBAL',
    binPrefix: '4111',
    primaryColor: '#0284C7',
    secondaryColor: '#0F766E',
    accentColor: '#67E8F9',
    logoVariant: 'aoi',
    sortOrder: 5,
    tierPolicies: {
      standard: {
        tier: 'standard',
        tierLabel: 'Standard',
        cardTitle: 'Aoi Breeze Standard',
        cashbackRate: 0.35,
        interestRate: 0.5,
        txFeePct: 0.1,
        fixedTxFee: 0,
        withdrawFee: 2200,
        intlFeePct: 1.8,
        maintenanceFee: 0,
        rewardPointRate: 1.5,
        perTxLimit: 20_000_000,
        dailyLimit: 50_000_000,
        monthlyLimit: 200_000_000,
        transferLimit: 50_000_000,
        withdrawLimit: 20_000_000,
        onlineLimit: 40_000_000,
        cashbackCapMonth: 700_000,
        interestBalanceCap: 60_000_000,
        creditLimit: 0,
        designTheme: 'aoi_std',
        benefits: ['Hoàn tiền 0.35% mọi hóa đơn & mua sắm', 'Phí giao dịch siêu thấp chỉ 0.1%', '1.5x điểm thưởng từ hạng cơ bản'],
        upgradeReq: makeUpgradeReq('standard'),
        issueUnlockReq: STANDARD_ISSUE_FREE,
      },
      silver: {
        tier: 'silver',
        tierLabel: 'Silver',
        cardTitle: 'Aoi Ocean Silver',
        cashbackRate: 0.7,
        interestRate: 1.3,
        txFeePct: 0,
        fixedTxFee: 0,
        withdrawFee: 0,
        intlFeePct: 1.2,
        maintenanceFee: 0,
        rewardPointRate: 2.0,
        perTxLimit: 35_000_000,
        dailyLimit: 75_000_000,
        monthlyLimit: 300_000_000,
        transferLimit: 75_000_000,
        withdrawLimit: 30_000_000,
        onlineLimit: 60_000_000,
        cashbackCapMonth: 1_800_000,
        interestBalanceCap: 120_000_000,
        creditLimit: 35_000_000,
        designTheme: 'aoi_silver',
        benefits: ['Miễn 100% phí thanh toán & rút ATM sớm nhất', 'Hoàn tiền 0.7% · 2x điểm thưởng', 'Lãi suất 1.3%/năm'],
        upgradeReq: makeUpgradeReq('silver'),
        issueUnlockReq: { minBalance: 4_500_000, minTotalAssets: 5_000_000 },
      },
      gold: {
        tier: 'gold',
        tierLabel: 'Gold',
        cardTitle: 'Aoi Azure Gold',
        cashbackRate: 1.3,
        interestRate: 2.3,
        txFeePct: 0,
        fixedTxFee: 0,
        withdrawFee: 0,
        intlFeePct: 0.8,
        maintenanceFee: 0,
        rewardPointRate: 2.6,
        perTxLimit: 65_000_000,
        dailyLimit: 130_000_000,
        monthlyLimit: 500_000_000,
        transferLimit: 130_000_000,
        withdrawLimit: 50_000_000,
        onlineLimit: 100_000_000,
        cashbackCapMonth: 3_500_000,
        interestBalanceCap: 250_000_000,
        creditLimit: 90_000_000,
        designTheme: 'aoi_gold',
        benefits: ['Hoàn tiền 1.3% · 2.6x điểm thưởng', 'Miễn 100% phí chuyển, thanh toán, ATM', 'Lãi suất 2.3%/năm'],
        upgradeReq: makeUpgradeReq('gold'),
        issueUnlockReq: { minBalance: 14_000_000, minTotalAssets: 22_000_000 },
      },
      platinum: {
        tier: 'platinum',
        tierLabel: 'Platinum',
        cardTitle: 'Aoi Cobalt Platinum',
        cashbackRate: 2.4,
        interestRate: 3.5,
        txFeePct: 0,
        fixedTxFee: 0,
        withdrawFee: 0,
        intlFeePct: 0.4,
        maintenanceFee: 0,
        rewardPointRate: 3.5,
        perTxLimit: 110_000_000,
        dailyLimit: 220_000_000,
        monthlyLimit: 850_000_000,
        transferLimit: 220_000_000,
        withdrawLimit: 80_000_000,
        onlineLimit: 180_000_000,
        cashbackCapMonth: 6_000_000,
        interestBalanceCap: 450_000_000,
        creditLimit: 170_000_000,
        designTheme: 'aoi_platinum',
        benefits: ['Hoàn tiền 2.4% · 3.5x điểm thưởng', 'Lãi suất 3.5%/năm', 'Miễn phí Hỏa tốc & Phí ngoại tệ 0.4%'],
        upgradeReq: makeUpgradeReq('platinum'),
        issueUnlockReq: { minBalance: 32_000_000, minTotalAssets: 55_000_000 },
      },
      diamond: {
        tier: 'diamond',
        tierLabel: 'Diamond',
        cardTitle: 'Aoi Sapphire Diamond',
        cashbackRate: 4.2,
        interestRate: 4.8,
        txFeePct: 0,
        fixedTxFee: 0,
        withdrawFee: 0,
        intlFeePct: 0,
        maintenanceFee: 0,
        rewardPointRate: 4.8,
        perTxLimit: 220_000_000,
        dailyLimit: 450_000_000,
        monthlyLimit: 1_600_000_000,
        transferLimit: 450_000_000,
        withdrawLimit: 160_000_000,
        onlineLimit: 350_000_000,
        cashbackCapMonth: 12_000_000,
        interestBalanceCap: 900_000_000,
        creditLimit: 360_000_000,
        designTheme: 'aoi_diamond',
        benefits: ['Hoàn tiền 4.2% · 4.8x điểm thưởng', 'Lãi suất 4.8%/năm', 'Miễn 100% mọi loại phí kể cả quốc tế'],
        upgradeReq: makeUpgradeReq('diamond'),
        issueUnlockReq: { minBalance: 75_000_000, minTotalAssets: 145_000_000 },
      },
      infinite: {
        tier: 'infinite',
        tierLabel: 'Infinite',
        cardTitle: 'Aoi Abyssal Horizon',
        cashbackRate: 6.0,
        interestRate: 6.0,
        txFeePct: 0,
        fixedTxFee: 0,
        withdrawFee: 0,
        intlFeePct: 0,
        maintenanceFee: 0,
        rewardPointRate: 7.0,
        perTxLimit: 500_000_000,
        dailyLimit: 1_000_000_000,
        monthlyLimit: 5_000_000_000,
        transferLimit: 1_000_000_000,
        withdrawLimit: 300_000_000,
        onlineLimit: 800_000_000,
        cashbackCapMonth: 25_000_000,
        interestBalanceCap: 2_500_000_000,
        creditLimit: 900_000_000,
        designTheme: 'aoi_infinite',
        benefits: ['7x Điểm thưởng cao nhất hệ thống!', 'Hoàn tiền 6.0% · Lãi suất 6.0%/năm', 'Không thu bất kỳ khoản phí nào'],
        upgradeReq: makeUpgradeReq('infinite'),
        issueUnlockReq: { minBalance: 160_000_000, minTotalAssets: 320_000_000 },
      },
    },
  },
];

export const BANK_MAP = new Map<BankBrandId, AnimeBankDefinition>(ANIME_CARD_BANKS.map((b) => [b.id, b]));

export function getBankDefinition(bankId?: string): AnimeBankDefinition {
  return BANK_MAP.get((bankId || 'hikari') as BankBrandId) || ANIME_CARD_BANKS[0];
}

export function getTierPolicy(bankId?: string, tier?: string): CardTierPolicy {
  const bank = getBankDefinition(bankId);
  const t = (CARD_TIER_ORDER.includes(tier as CardTierId) ? tier : 'standard') as CardTierId;
  return bank.tierPolicies[t];
}

function ensureColumn(db: Database.Database, table: string, column: string, definition: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function normalizePanDigits(raw: string): string {
  return String(raw || '').replace(/\D/g, '');
}

export function formatPanGroups(digits: string): string {
  const clean = normalizePanDigits(digits);
  return clean.replace(/(.{4})/g, '$1 ').trim();
}

export function hashPan(digits: string): string {
  return crypto.createHash('sha256').update(`PHONEOS_PAN_V1:${normalizePanDigits(digits)}`).digest('hex');
}

export function hashCvv(cvv: string): string {
  return crypto.createHash('sha256').update(`PHONEOS_CVV_V1:${String(cvv || '').trim()}`).digest('hex');
}

export function getOrCreateCardVaultKey(db: Database.Database): Buffer {
  const envKey = String(process.env.CARD_VAULT_KEY || '').trim();
  if (envKey) {
    return crypto.createHash('sha256').update(envKey).digest();
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS banking_vault_secrets (
      key_name TEXT PRIMARY KEY,
      key_hex TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  const row = db
    .prepare("SELECT key_hex FROM banking_vault_secrets WHERE key_name = 'card_vault_master' LIMIT 1")
    .get() as { key_hex?: string } | undefined;
  if (row?.key_hex && row.key_hex.length === 64) {
    return Buffer.from(row.key_hex, 'hex');
  }
  const keyBuf = crypto.randomBytes(32);
  db.prepare("INSERT OR REPLACE INTO banking_vault_secrets (key_name, key_hex, created_at) VALUES ('card_vault_master', ?, ?)").run(
    keyBuf.toString('hex'),
    new Date().toISOString()
  );
  return keyBuf;
}

export function encryptVaultSecret(db: Database.Database, plainText: string): string {
  const key = getOrCreateCardVaultKey(db);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decryptVaultSecret(db: Database.Database, cipherPayload: string): string {
  const parts = String(cipherPayload || '').split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Dữ liệu thẻ mã hóa không hợp lệ');
  }
  const key = getOrCreateCardVaultKey(db);
  const iv = Buffer.from(parts[1], 'hex');
  const tag = Buffer.from(parts[2], 'hex');
  const enc = Buffer.from(parts[3], 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

export function generateUniqueSimulatedPan(
  db: Database.Database,
  binPrefix: string,
  preferredLast4?: string
): { digits: string; formatted: string; last4: string; panHash: string } {
  const cleanBin = normalizePanDigits(binPrefix || '9704').slice(0, 4).padEnd(4, '9');
  const cleanPrefLast4 = normalizePanDigits(preferredLast4 || '');
  for (let attempt = 0; attempt < 30; attempt++) {
    const mid8 = String(crypto.randomInt(10000000, 99999999));
    const tail4 =
      attempt === 0 && cleanPrefLast4.length === 4 ? cleanPrefLast4 : String(crypto.randomInt(1000, 9999));
    const digits = `${cleanBin}${mid8}${tail4}`;
    const panHash = hashPan(digits);
    const exists = db.prepare('SELECT 1 FROM banking_cards WHERE card_number_hash = ? LIMIT 1').get(panHash);
    if (!exists) {
      return {
        digits,
        formatted: formatPanGroups(digits),
        last4: tail4,
        panHash,
      };
    }
  }
  const fallbackMid = String(crypto.randomInt(10000000, 99999999));
  const fallbackLast4 = String(crypto.randomInt(1000, 9999));
  const digits = `${cleanBin}${fallbackMid}${fallbackLast4}`;
  return {
    digits,
    formatted: formatPanGroups(digits),
    last4: fallbackLast4,
    panHash: hashPan(digits),
  };
}

export function generateSimulatedCvv(): string {
  return String(crypto.randomInt(100, 999));
}

export function computeFutureExpiry(years = 5): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String((d.getFullYear() + years) % 100).padStart(2, '0');
  return `${mm}/${yy}`;
}

export function initCardSystemDatabase(db: Database.Database): void {
  // Extend banking_cards non-destructively
  ensureColumn(db, 'banking_cards', 'bank_id', "TEXT DEFAULT 'hikari'");
  ensureColumn(db, 'banking_cards', 'card_tier', "TEXT DEFAULT 'standard'");
  ensureColumn(db, 'banking_cards', 'card_category', "TEXT DEFAULT 'debit'");
  ensureColumn(db, 'banking_cards', 'issued_at', "TEXT DEFAULT ''");
  ensureColumn(db, 'banking_cards', 'locked_at', "TEXT DEFAULT ''");
  ensureColumn(db, 'banking_cards', 'unlocked_at', "TEXT DEFAULT ''");
  ensureColumn(db, 'banking_cards', 'cancelled_at', "TEXT DEFAULT ''");
  ensureColumn(db, 'banking_cards', 'replaced_by_card_id', "TEXT DEFAULT ''");
  ensureColumn(db, 'banking_cards', 'intl_payment_enabled', 'INTEGER DEFAULT 1');
  ensureColumn(db, 'banking_cards', 'card_number_enc', "TEXT DEFAULT ''");
  ensureColumn(db, 'banking_cards', 'card_number_hash', "TEXT DEFAULT ''");
  ensureColumn(db, 'banking_cards', 'cvv_enc', "TEXT DEFAULT ''");
  ensureColumn(db, 'banking_cards', 'cvv_hash', "TEXT DEFAULT ''");
  ensureColumn(db, 'banking_cards', 'card_pin_hash', "TEXT DEFAULT ''");
  ensureColumn(db, 'banking_cards', 'expiring_notified_at', "TEXT DEFAULT ''");
  ensureColumn(db, 'banking_cards', 'cashback_rate', 'REAL DEFAULT 0');
  ensureColumn(db, 'banking_cards', 'interest_rate', 'REAL DEFAULT 0');
  ensureColumn(db, 'banking_cards', 'tx_fee_pct', 'REAL DEFAULT 0.3');
  ensureColumn(db, 'banking_cards', 'fixed_tx_fee', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'banking_cards', 'withdraw_fee', 'INTEGER DEFAULT 5500');
  ensureColumn(db, 'banking_cards', 'intl_fee_pct', 'REAL DEFAULT 2.5');
  ensureColumn(db, 'banking_cards', 'maintenance_fee', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'banking_cards', 'reward_point_rate', 'REAL DEFAULT 1.0');
  ensureColumn(db, 'banking_cards', 'reward_points', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'banking_cards', 'per_tx_limit', 'INTEGER DEFAULT 20000000');
  ensureColumn(db, 'banking_cards', 'transfer_limit', 'INTEGER DEFAULT 50000000');
  ensureColumn(db, 'banking_cards', 'withdraw_limit', 'INTEGER DEFAULT 20000000');
  ensureColumn(db, 'banking_cards', 'online_limit', 'INTEGER DEFAULT 30000000');
  ensureColumn(db, 'banking_cards', 'spent_today', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'banking_cards', 'spent_date', "TEXT DEFAULT ''");
  ensureColumn(db, 'banking_cards', 'cashback_cap_month', 'INTEGER DEFAULT 2000000');
  ensureColumn(db, 'banking_cards', 'cashback_used_month', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'banking_cards', 'interest_balance_cap', 'INTEGER DEFAULT 100000000');
  ensureColumn(db, 'banking_cards', 'last_interest_at', "TEXT DEFAULT ''");
  ensureColumn(db, 'banking_cards', 'linked_status', "TEXT DEFAULT 'linked'");
  ensureColumn(db, 'banking_cards', 'network_brand', "TEXT DEFAULT 'HIKARI PAY'");
  ensureColumn(db, 'banking_cards', 'benefits_json', "TEXT DEFAULT '[]'");

  ensureColumn(db, 'banking_transactions_demo', 'tx_status_code', "TEXT DEFAULT 'SUCCESS'");
  ensureColumn(db, 'banking_transactions_demo', 'tx_usage_channel', "TEXT DEFAULT ''");

  db.exec(`
    CREATE TABLE IF NOT EXISTS banking_vault_secrets (
      key_name TEXT PRIMARY KEY,
      key_hex TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_banking_cards_pan_hash
      ON banking_cards(card_number_hash)
      WHERE card_number_hash != '';

    CREATE TABLE IF NOT EXISTS banking_card_banks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      jp_name TEXT DEFAULT '',
      short_code TEXT NOT NULL,
      tagline TEXT DEFAULT '',
      specialty TEXT DEFAULT '',
      network_brand TEXT DEFAULT 'HIKARI PAY',
      bin_prefix TEXT DEFAULT '9704',
      primary_color TEXT NOT NULL,
      secondary_color TEXT NOT NULL,
      accent_color TEXT NOT NULL,
      logo_variant TEXT NOT NULL,
      tier_policies_json TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS banking_card_partners (
      id TEXT PRIMARY KEY,
      merchant_name TEXT NOT NULL,
      category TEXT NOT NULL,
      bank_id TEXT DEFAULT '',
      min_tier TEXT DEFAULT 'standard',
      cashback_bonus_pct REAL DEFAULT 0,
      discount_pct REAL DEFAULT 0,
      max_discount INTEGER DEFAULT 0,
      points_bonus_pct INTEGER DEFAULT 0,
      default_amount INTEGER DEFAULT 150000,
      description TEXT DEFAULT '',
      conditions_text TEXT DEFAULT '',
      expires_at TEXT DEFAULT '2027-12-31',
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS banking_card_rewards_catalog (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      reward_type TEXT NOT NULL,
      points_cost INTEGER NOT NULL,
      cash_value INTEGER DEFAULT 0,
      voucher_discount_pct REAL DEFAULT 0,
      voucher_category TEXT DEFAULT '',
      merchant_name TEXT DEFAULT '',
      description TEXT DEFAULT '',
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS banking_card_vouchers (
      id TEXT PRIMARY KEY,
      catalog_id TEXT NOT NULL,
      card_id TEXT DEFAULT '',
      title TEXT NOT NULL,
      reward_type TEXT NOT NULL,
      cash_value INTEGER DEFAULT 0,
      discount_pct REAL DEFAULT 0,
      max_discount INTEGER DEFAULT 0,
      min_spend INTEGER DEFAULT 0,
      category TEXT DEFAULT '',
      code TEXT NOT NULL,
      status TEXT DEFAULT 'available',
      redeemed_at TEXT NOT NULL,
      used_at TEXT DEFAULT '',
      expires_at TEXT DEFAULT '2027-12-31'
    );

    CREATE TABLE IF NOT EXISTS banking_card_points_ledger (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL,
      tx_id TEXT DEFAULT '',
      delta_points INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      action_type TEXT NOT NULL,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS banking_card_cashback_logs (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL,
      source_tx_id TEXT NOT NULL,
      cashback_tx_id TEXT NOT NULL,
      merchant TEXT DEFAULT '',
      category TEXT DEFAULT '',
      base_amount INTEGER NOT NULL,
      rate_pct REAL NOT NULL,
      cashback_amount INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_card_cashback_source_tx
      ON banking_card_cashback_logs(source_tx_id);

    CREATE TABLE IF NOT EXISTS banking_card_interest_logs (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      tx_id TEXT NOT NULL,
      cycle_key TEXT NOT NULL,
      eligible_balance INTEGER NOT NULL,
      interest_rate REAL NOT NULL,
      interest_amount INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_card_interest_cycle
      ON banking_card_interest_logs(card_id, cycle_key);

    CREATE TABLE IF NOT EXISTS banking_card_bills (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      merchant_name TEXT NOT NULL,
      category TEXT NOT NULL,
      partner_id TEXT DEFAULT '',
      amount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'unpaid',
      due_date TEXT DEFAULT '',
      description TEXT DEFAULT '',
      paid_at TEXT DEFAULT '',
      paid_tx_id TEXT DEFAULT '',
      paid_card_id TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_card_bills_status
      ON banking_card_bills(status);
  `);

  ensureColumn(db, 'banking_card_partners', 'max_discount', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'banking_card_partners', 'points_bonus_pct', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'banking_card_vouchers', 'max_discount', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'banking_card_vouchers', 'min_spend', 'INTEGER DEFAULT 0');

  seedCardSystemData(db, false);
}

export function seedCardSystemData(db: Database.Database, forceReset = false): void {
  if (forceReset) {
    db.exec(`
      DELETE FROM banking_card_vouchers;
      DELETE FROM banking_card_points_ledger;
      DELETE FROM banking_card_cashback_logs;
      DELETE FROM banking_card_interest_logs;
      DELETE FROM banking_card_bills;
      DELETE FROM banking_vault_secrets WHERE key_name = 'card_bills_seeded';
    `);
  }

  const billsAlreadySeeded = Boolean(
    db.prepare("SELECT 1 FROM banking_vault_secrets WHERE key_name = 'card_bills_seeded' LIMIT 1").get()
  );
  if (!billsAlreadySeeded || forceReset) {
    const now = new Date().toISOString();
    const insBill = db.prepare(`
      INSERT OR IGNORE INTO banking_card_bills (
        id, title, merchant_name, category, partner_id, amount, status, due_date, description, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'unpaid', ?, ?, ?)
    `);
    insBill.run(
      'cbill_dining_01',
      'Hóa đơn Tokyo Matcha & Highlands Café',
      'Tokyo Matcha & Highlands Café',
      'Ăn uống',
      'prt_dining',
      125000,
      '2026-12-25',
      'Hóa đơn đối tác Hoàn tiền duy nhất (+2% cashback)',
      now
    );
    insBill.run(
      'cbill_shop_02',
      'Hóa đơn Uniqlo Flagship & Shibuya Moda',
      'Uniqlo Flagship & Shibuya Moda',
      'Mua sắm',
      'prt_shopping',
      680000,
      '2026-12-26',
      'Hóa đơn mua sắm thời trang thu đông',
      now
    );
    insBill.run(
      'cbill_cinema_03',
      'Vé xem phim CGV IMAX & Anime Cinema',
      'CGV IMAX & Anime Cinema',
      'Giải trí',
      'prt_cinema',
      240000,
      '2026-12-27',
      'Combo vé IMAX + bắp nước cuối tuần',
      now
    );
    insBill.run(
      'cbill_tech_04',
      'Hóa đơn Akihabara Digital & Figure Hub',
      'Akihabara Digital & Figure Hub',
      'Mua sắm',
      'prt_tech',
      1450000,
      '2026-12-28',
      'Đơn đặt hàng phụ kiện & figure giới hạn',
      now
    );
    insBill.run(
      'cbill_travel_05',
      'Vé Shinkansen YumeTravel Express',
      'YumeTravel · Shinkansen & Resort',
      'Du lịch',
      'prt_travel',
      2800000,
      '2026-12-30',
      'Vé tàu cao tốc khứ hồi Tokyo - Kyoto',
      now
    );
    db.prepare(
      "INSERT OR REPLACE INTO banking_vault_secrets (key_name, key_hex, created_at) VALUES ('card_bills_seeded', '1', ?)"
    ).run(now);
  }

  // Upsert the 5 Fictional Anime Bank policies so catalog always matches definitions
  const upsertBank = db.prepare(`
    INSERT INTO banking_card_banks (
      id, name, jp_name, short_code, tagline, specialty, network_brand, bin_prefix,
      primary_color, secondary_color, accent_color, logo_variant, tier_policies_json, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      jp_name = excluded.jp_name,
      short_code = excluded.short_code,
      tagline = excluded.tagline,
      specialty = excluded.specialty,
      network_brand = excluded.network_brand,
      bin_prefix = excluded.bin_prefix,
      primary_color = excluded.primary_color,
      secondary_color = excluded.secondary_color,
      accent_color = excluded.accent_color,
      logo_variant = excluded.logo_variant,
      tier_policies_json = excluded.tier_policies_json,
      sort_order = excluded.sort_order
  `);

  for (const b of ANIME_CARD_BANKS) {
    upsertBank.run(
      b.id,
      b.name,
      b.jpName,
      b.shortCode,
      b.tagline,
      b.specialty,
      b.networkBrand,
      b.binPrefix,
      b.primaryColor,
      b.secondaryColor,
      b.accentColor,
      b.logoVariant,
      JSON.stringify(b.tierPolicies),
      b.sortOrder
    );
  }

  // Partner stores & active offers:
  // Only ONE designated cashback boost partner (prt_dining), all other partners provide distinct % perks (direct discount % or bonus points %).
  const upsertPartner = db.prepare(`
    INSERT INTO banking_card_partners (
      id, merchant_name, category, bank_id, min_tier, cashback_bonus_pct, discount_pct, max_discount, points_bonus_pct, default_amount, description, conditions_text, expires_at, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(id) DO UPDATE SET
      merchant_name = excluded.merchant_name,
      category = excluded.category,
      bank_id = excluded.bank_id,
      min_tier = excluded.min_tier,
      cashback_bonus_pct = excluded.cashback_bonus_pct,
      discount_pct = excluded.discount_pct,
      max_discount = excluded.max_discount,
      points_bonus_pct = excluded.points_bonus_pct,
      default_amount = excluded.default_amount,
      description = excluded.description,
      conditions_text = excluded.conditions_text,
      expires_at = excluded.expires_at,
      is_active = 1
  `);
  upsertPartner.run(
    'prt_dining',
    'Tokyo Matcha & Highlands Café',
    'Ăn uống',
    '',
    'standard',
    2.0,
    0,
    0,
    0,
    125000,
    'Đối tác Hoàn tiền duy nhất: cộng thêm +2% cashback cho hóa đơn cà phê & nhà hàng',
    'Áp dụng tất cả hạng thẻ · Chỉ 1 mục hoàn tiền cộng thêm duy nhất',
    '2027-12-31'
  );
  upsertPartner.run(
    'prt_shopping',
    'Uniqlo Flagship & Shibuya Moda',
    'Mua sắm',
    'sakura',
    'silver',
    0,
    8,
    250000,
    0,
    680000,
    'Giảm trực tiếp 8% hóa đơn thời trang & phụ kiện (tối đa 250.000đ)',
    'Áp dụng từ hạng Silver · Vẫn nhận hoàn tiền gốc của thẻ',
    '2027-12-31'
  );
  upsertPartner.run(
    'prt_cinema',
    'CGV IMAX & Anime Cinema',
    'Giải trí',
    '',
    'standard',
    0,
    0,
    0,
    50,
    240000,
    'Thưởng thêm +50% điểm thưởng khi mua vé IMAX & giải trí cuối tuần',
    'Áp dụng mọi hạng thẻ · Vẫn nhận hoàn tiền gốc của thẻ',
    '2027-12-31'
  );
  upsertPartner.run(
    'prt_travel',
    'YumeTravel · Shinkansen & Resort',
    'Du lịch',
    'tsuki',
    'gold',
    0,
    10,
    500000,
    0,
    2800000,
    'Giảm trực tiếp 10% đặt vé Shinkansen & khách sạn (tối đa 500.000đ)',
    'Yêu cầu hạng Gold trở lên · Vẫn nhận hoàn tiền gốc của thẻ',
    '2027-12-31'
  );
  upsertPartner.run(
    'prt_tech',
    'Akihabara Digital & Figure Hub',
    'Mua sắm',
    'akuma',
    'gold',
    0,
    0,
    0,
    100,
    1450000,
    'Nhân đôi (+100%) điểm thưởng khi mua thiết bị công nghệ & figure bản giới hạn',
    'Áp dụng từ hạng Gold · Vẫn nhận hoàn tiền gốc của thẻ',
    '2027-12-31'
  );
  upsertPartner.run(
    'prt_wellness',
    'Aoi Onsen & Wellness Spa',
    'Sức khỏe',
    'aoi',
    'platinum',
    0,
    12,
    350000,
    0,
    950000,
    'Giảm trực tiếp 12% dịch vụ thư giãn Onsen & chăm sóc sức khỏe (tối đa 350.000đ)',
    'Yêu cầu hạng Platinum trở lên · Vẫn nhận hoàn tiền gốc của thẻ',
    '2027-12-31'
  );

  // Reward redemption catalog
  if ((db.prepare('SELECT COUNT(*) as c FROM banking_card_rewards_catalog').get() as { c: number }).c === 0 || forceReset) {
    db.prepare('DELETE FROM banking_card_rewards_catalog').run();
    const insRew = db.prepare(`
      INSERT INTO banking_card_rewards_catalog (
        id, title, reward_type, points_cost, cash_value, voucher_discount_pct, voucher_category, merchant_name, description, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    insRew.run(
      'rew_cash_50k',
      'Quy đổi 50.000đ tiền mặt',
      'cash_bonus',
      50,
      50000,
      0,
      'Tiền mặt',
      'Chuyển thẳng vào TK liên kết',
      'Cộng trực tiếp 50.000 VNĐ vào tài khoản ngân hàng liên kết với thẻ'
    );
    insRew.run(
      'rew_cash_200k',
      'Quy đổi 200.000đ tiền mặt VIP',
      'cash_bonus',
      180,
      200000,
      0,
      'Tiền mặt',
      'Chuyển thẳng vào TK liên kết',
      'Tiết kiệm 10% điểm thưởng — cộng 200.000 VNĐ trực tiếp vào số dư'
    );
    insRew.run(
      'rew_voucher_cafe',
      'Voucher giảm 15% Ăn uống',
      'voucher',
      25,
      0,
      15,
      'Ăn uống',
      'Tokyo Matcha & Highlands Café',
      'Giảm trực tiếp 15% hóa đơn khi thanh toán tại đối tác Ăn uống'
    );
    insRew.run(
      'rew_voucher_shop',
      'Voucher Mua sắm giảm 100.000đ',
      'voucher',
      60,
      100000,
      0,
      'Mua sắm',
      'Uniqlo & Akihabara Hub',
      'Trừ trực tiếp 100.000đ vào hóa đơn Mua sắm từ 250.000đ trở lên'
    );
    insRew.run(
      'rew_item_charm',
      'Huy hiệu Giới hạn Hikari Collector',
      'item',
      40,
      0,
      0,
      'Quà tặng',
      'Bộ sưu tập Phone OS',
      'Vật phẩm lưu niệm cao cấp dành cho chủ thẻ thành viên anime'
    );
    insRew.run(
      'rew_perk_lounge',
      'Vé Đặc quyền VIP Lounge & Fast-Track',
      'perk',
      120,
      0,
      20,
      'Du lịch',
      'YumeTravel VIP Lounge',
      'Giảm 20% gói du lịch YumeTravel + 1 lượt sử dụng phòng chờ sân bay'
    );
  }

  // Migrate existing cards cleanly so card_1..card_4 preserve their IDs and have rich multi-bank tier specs
  const existingCards = db.prepare('SELECT * FROM banking_cards').all() as Array<Record<string, unknown>>;
  const thirtyTwoDaysAgo = new Date(Date.now() - 32 * 86400_000).toISOString();
  const todayStr = new Date().toISOString().slice(0, 10);

  const defaultMap: Record<string, { bankId: BankBrandId; tier: CardTierId; pts: number; lastInt: string }> = {
    card_1: { bankId: 'hikari', tier: 'standard', pts: 28, lastInt: '' },
    card_2: { bankId: 'hikari', tier: 'gold', pts: 95, lastInt: thirtyTwoDaysAgo },
    card_3: { bankId: 'sakura', tier: 'platinum', pts: 240, lastInt: thirtyTwoDaysAgo },
    card_4: { bankId: 'tsuki', tier: 'silver', pts: 64, lastInt: thirtyTwoDaysAgo },
  };

  for (const card of existingCards) {
    const id = String(card.id);
    const mapped = defaultMap[id];
    const currentBenefits = String(card.benefits_json || '[]');
    const needsBackfill = currentBenefits === '[]' || currentBenefits === '' || !card.network_brand || Number(card.per_tx_limit || 0) === 0;
    if (!needsBackfill) {
      const existingTier = (CARD_TIER_ORDER.includes(String(card.card_tier) as CardTierId)
        ? String(card.card_tier)
        : mapped?.tier || 'standard') as CardTierId;
      const existingBankId = (String(card.bank_id || mapped?.bankId || 'hikari')) as BankBrandId;
      const policyCheck = getTierPolicy(existingBankId, existingTier);
      if (Number(card.cashback_rate || 0) <= 0 || Number(card.cashback_cap_month || 0) <= 0) {
        db.prepare(`
          UPDATE banking_cards
          SET cashback_rate = CASE WHEN COALESCE(cashback_rate, 0) <= 0 THEN ? ELSE cashback_rate END,
              cashback_cap_month = CASE WHEN COALESCE(cashback_cap_month, 0) <= 0 THEN ? ELSE cashback_cap_month END,
              benefits_json = ?
          WHERE id = ?
        `).run(
          policyCheck.cashbackRate,
          policyCheck.cashbackCapMonth,
          JSON.stringify(policyCheck.benefits),
          id
        );
      }
      continue;
    }

    let bankId: BankBrandId = mapped?.bankId || 'hikari';
    let tier: CardTierId = mapped?.tier || 'standard';
    if (!mapped) {
      const ct = String(card.card_type || '').toLowerCase();
      if (ct.includes('sakura') || ct.includes('anime')) bankId = 'sakura';
      else if (ct.includes('akuma') || ct.includes('black')) bankId = 'akuma';
      else if (ct.includes('tsuki')) bankId = 'tsuki';
      else if (ct.includes('aoi')) bankId = 'aoi';

      if (ct.includes('infinite') || ct.includes('black_edition')) tier = 'infinite';
      else if (ct.includes('diamond')) tier = 'diamond';
      else if (ct.includes('platinum') || ct.includes('anime')) tier = 'platinum';
      else if (ct.includes('gold') || ct.includes('premier') || ct.includes('credit')) tier = 'gold';
      else if (ct.includes('silver') || ct.includes('character') || ct.includes('international')) tier = 'silver';
      else tier = 'standard';
    }

    const bank = getBankDefinition(bankId);
    const policy = getTierPolicy(bankId, tier);
    const existingSpentMonth = Number(card.spent_month || 0);
    const initialPts = Number(card.reward_points || 0) || mapped?.pts || Math.max(12, Math.floor(existingSpentMonth / 100000));
    const lastInt = String(card.last_interest_at || '') || mapped?.lastInt || '';

    db.prepare(`
      UPDATE banking_cards SET
        bank_id = ?,
        card_tier = ?,
        cashback_rate = ?,
        interest_rate = ?,
        tx_fee_pct = ?,
        fixed_tx_fee = ?,
        withdraw_fee = ?,
        intl_fee_pct = ?,
        maintenance_fee = ?,
        reward_point_rate = ?,
        reward_points = ?,
        per_tx_limit = ?,
        daily_limit = CASE WHEN daily_limit > 0 THEN MAX(daily_limit, ?) ELSE ? END,
        monthly_limit = CASE WHEN monthly_limit > 0 THEN MAX(monthly_limit, ?) ELSE ? END,
        transfer_limit = ?,
        withdraw_limit = ?,
        online_limit = ?,
        spent_today = COALESCE(spent_today, 0),
        spent_date = COALESCE(NULLIF(spent_date, ''), ?),
        cashback_cap_month = ?,
        interest_balance_cap = ?,
        last_interest_at = ?,
        linked_status = CASE WHEN COALESCE(account_id, '') != '' THEN 'linked' ELSE 'unlinked' END,
        network_brand = ?,
        benefits_json = ?
      WHERE id = ?
    `).run(
      bankId,
      tier,
      policy.cashbackRate,
      policy.interestRate,
      policy.txFeePct,
      policy.fixedTxFee,
      policy.withdrawFee,
      policy.intlFeePct,
      policy.maintenanceFee,
      policy.rewardPointRate,
      initialPts,
      policy.perTxLimit,
      policy.dailyLimit,
      policy.dailyLimit,
      policy.monthlyLimit,
      policy.monthlyLimit,
      policy.transferLimit,
      policy.withdrawLimit,
      policy.onlineLimit,
      todayStr,
      policy.cashbackCapMonth,
      policy.interestBalanceCap,
      lastInt,
      bank.networkBrand,
      JSON.stringify(policy.benefits),
      id
    );
  }

  // Backfill encrypted PAN, CVV, issued_at, and Debit/Credit category for every card cleanly
  const cardsForVault = db.prepare('SELECT * FROM banking_cards').all() as Array<Record<string, unknown>>;
  for (const c of cardsForVault) {
    const id = String(c.id);
    const bank = getBankDefinition(String(c.bank_id || 'hikari'));
    const hasEncPan = Boolean(String(c.card_number_enc || '').trim() && String(c.card_number_hash || '').trim());
    const hasEncCvv = Boolean(String(c.cvv_enc || '').trim() && String(c.cvv_hash || '').trim());
    const needsIssued = !String(c.issued_at || '').trim();
    const needsCategory = !String(c.card_category || '').trim() || (id === 'card_3' && String(c.card_category) === 'debit' && Number(c.credit_limit || 0) > 0);

    if (!hasEncPan || !hasEncCvv || needsIssued || needsCategory || String(c.cvv || '') !== '•••') {
      const prefLast4 = normalizePanDigits(String(c.last4 || ''));
      const panInfo = hasEncPan
        ? null
        : generateUniqueSimulatedPan(db, bank.binPrefix, prefLast4.length === 4 ? prefLast4 : undefined);
      const rawCvv = hasEncCvv ? null : generateSimulatedCvv();
      const cat: CardCategory =
        id === 'card_3' || id === 'card_4'
          ? Number(c.credit_limit || 0) > 0 || String(c.card_type || '').toLowerCase().includes('credit')
            ? 'credit'
            : 'debit'
          : String(c.card_category || '').toLowerCase() === 'credit' || String(c.card_type || '').toLowerCase().includes('credit')
          ? 'credit'
          : 'debit';

      const issuedAt = String(c.issued_at || '').trim() || String(c.created_at || new Date().toISOString()).slice(0, 10);
      const nextExpiry = String(c.expiry || '').trim() || computeFutureExpiry(5);

      db.prepare(`
        UPDATE banking_cards SET
          card_number_enc = COALESCE(NULLIF(card_number_enc, ''), ?),
          card_number_hash = COALESCE(NULLIF(card_number_hash, ''), ?),
          masked_number = ?,
          last4 = ?,
          cvv_enc = COALESCE(NULLIF(cvv_enc, ''), ?),
          cvv_hash = COALESCE(NULLIF(cvv_hash, ''), ?),
          cvv = '•••',
          card_category = ?,
          issued_at = ?,
          expiry = ?,
          intl_payment_enabled = COALESCE(intl_payment_enabled, 1)
        WHERE id = ?
      `).run(
        panInfo ? encryptVaultSecret(db, panInfo.digits) : String(c.card_number_enc),
        panInfo ? panInfo.panHash : String(c.card_number_hash),
        panInfo ? `${bank.binPrefix} •••• •••• ${panInfo.last4}` : `${bank.binPrefix} •••• •••• ${String(c.last4 || prefLast4 || '0000')}`,
        panInfo ? panInfo.last4 : String(c.last4 || prefLast4 || '0000'),
        rawCvv ? encryptVaultSecret(db, rawCvv) : String(c.cvv_enc),
        rawCvv ? hashCvv(rawCvv) : String(c.cvv_hash),
        cat,
        issuedAt,
        nextExpiry,
        id
      );
    }
  }
}
