import type Database from 'better-sqlite3';
import crypto from 'crypto';
import { initCardSystemDatabase, seedCardSystemData } from './db_cards.ts';

function ensureColumn(db: Database.Database, table: string, column: string, definition: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function hashSecretLocal(secret: string): string {
  return crypto.createHash('sha256').update(`phone_os_v3:${secret}`).digest('hex');
}

export function buildLoanSchedule(
  principal: number,
  annualRatePct: number,
  termMonths: number,
  startIso: string,
  paidMonths = 0
): {
  monthlyPayment: number;
  schedule: Array<{
    month: number;
    dueDate: string;
    principalDue: number;
    interestDue: number;
    totalDue: number;
    remainingBalance: number;
    paid: boolean;
    paidAt: string;
  }>;
} {
  const safeTerm = Math.max(1, termMonths);
  const monthlyRate = annualRatePct / 100 / 12;
  const monthlyPayment =
    monthlyRate === 0
      ? Math.round(principal / safeTerm)
      : Math.round(
          (principal * monthlyRate * Math.pow(1 + monthlyRate, safeTerm)) /
            (Math.pow(1 + monthlyRate, safeTerm) - 1)
        );

  const schedule: Array<{
    month: number;
    dueDate: string;
    principalDue: number;
    interestDue: number;
    totalDue: number;
    remainingBalance: number;
    paid: boolean;
    paidAt: string;
  }> = [];

  let balance = principal;
  const start = new Date(startIso);

  for (let m = 1; m <= safeTerm; m++) {
    const interestDue = Math.round(balance * monthlyRate);
    const principalDue = m === safeTerm ? balance : Math.min(balance, monthlyPayment - interestDue);
    const totalDue = principalDue + interestDue;
    balance = Math.max(0, balance - principalDue);

    const due = new Date(start);
    due.setMonth(due.getMonth() + m);
    const isPaid = m <= paidMonths;

    schedule.push({
      month: m,
      dueDate: due.toISOString().slice(0, 10),
      principalDue,
      interestDue,
      totalDue,
      remainingBalance: balance,
      paid: isPaid,
      paidAt: isPaid ? due.toISOString() : '',
    });
  }

  return { monthlyPayment, schedule };
}

export const AI_BANK_PROFILES: Record<
  string,
  {
    accountNumber: string;
    balance: number;
    monthlyIncome: number;
    monthlyExpense: number;
    personality: 'generous' | 'frugal' | 'spender' | 'cautious' | 'lender' | 'borrower' | 'wealthy' | 'struggling';
    personalityLabel: string;
  }
> = {
  char_yuki: {
    accountNumber: '8800-2026-7712',
    balance: 18650000,
    monthlyIncome: 24000000,
    monthlyExpense: 11500000,
    personality: 'generous',
    personalityLabel: 'Hào phóng · Chu đáo',
  },
  char_akira: {
    accountNumber: '8800-2026-4405',
    balance: 64200000,
    monthlyIncome: 55000000,
    monthlyExpense: 18000000,
    personality: 'wealthy',
    personalityLabel: 'Thu nhập cao · Thực tế',
  },
  char_sakura: {
    accountNumber: '8800-2026-1111',
    balance: 4850000,
    monthlyIncome: 14000000,
    monthlyExpense: 12800000,
    personality: 'spender',
    personalityLabel: 'Chi tiêu nhiều · Ngẫu hứng',
  },
  char_rin: {
    accountNumber: '8800-2026-2222',
    balance: 32900000,
    monthlyIncome: 34000000,
    monthlyExpense: 14200000,
    personality: 'cautious',
    personalityLabel: 'Cẩn trọng · Tính toán kỹ',
  },
};

export function ensureAiCharacterBankAccount(db: Database.Database, characterId: string): void {
  if (!characterId) return;
  const char = db.prepare('SELECT id, name, avatar, personality FROM characters WHERE id = ?').get(characterId) as
    | { id: string; name: string; avatar: string; personality: string }
    | undefined;
  if (!char) return;

  const existing = db
    .prepare("SELECT id, avatar, holder_name FROM banking_accounts_demo WHERE owner_type = 'ai' AND character_id = ?")
    .get(characterId) as { id: string; avatar?: string; holder_name?: string } | undefined;
  if (existing) {
    if ((char.avatar && existing.avatar !== char.avatar) || (char.name && existing.holder_name !== char.name)) {
      db.prepare('UPDATE banking_accounts_demo SET avatar = ?, holder_name = ? WHERE id = ?').run(
        char.avatar || '',
        char.name,
        existing.id
      );
    }
    return;
  }

  const preset = AI_BANK_PROFILES[char.id];
  const hash = crypto.createHash('md5').update(char.id).digest('hex');
  const tailDigits = String(parseInt(hash.slice(0, 6), 16) % 9000 + 1000);
  const accNumber = preset?.accountNumber || `8800-2026-${tailDigits}`;
  const balance = preset?.balance ?? 12500000;
  const personality =
    preset?.personality ||
    (/tiết kiệm|kỹ|thận trọng/i.test(char.personality)
      ? 'cautious'
      : /hào phóng|ấm áp|dịu dàng/i.test(char.personality)
      ? 'generous'
      : 'balanced');

  const now = new Date().toISOString().slice(0, 10);
  const accId = `ai_acc_${char.id}`;

  db.prepare(`
    INSERT OR IGNORE INTO banking_accounts_demo (
      id, bank_name, account_number, holder_name, balance, pin_hash,
      account_type, available_balance, held_balance, daily_limit, monthly_limit, status, opened_at,
      nickname, avatar, is_hidden, is_primary, package_tier, owner_type, character_id, account_role,
      financial_personality, monthly_income, monthly_expense
    ) VALUES (?, 'Hikari Bank', ?, ?, ?, '', 'Tài khoản Nhân vật CHAR', ?, 0, 50000000, 200000000, 'Đang hoạt động', ?, ?, ?, 0, 0, 'Hikari AI', 'ai', ?, 'ai', ?, ?, ?)
  `).run(
    accId,
    accNumber,
    char.name,
    balance,
    balance,
    now,
    preset?.personalityLabel || 'Tài khoản cá nhân CHAR',
    char.avatar || '',
    char.id,
    personality,
    preset?.monthlyIncome ?? 18000000,
    preset?.monthlyExpense ?? 8500000
  );
}

export function seedBankingDemoData(db: Database.Database, forceReset = false): void {
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const daysAgo = (d: number, hour = 10) => {
    const dt = new Date(nowDate.getTime() - d * 86400_000);
    dt.setHours(hour, 15, 0, 0);
    return dt.toISOString();
  };
  const monthsAgo = (m: number, day = 12) => {
    const dt = new Date(nowDate);
    dt.setMonth(dt.getMonth() - m, day);
    dt.setHours(14, 30, 0, 0);
    return dt.toISOString();
  };
  const monthsAhead = (m: number) => {
    const dt = new Date(nowDate);
    dt.setMonth(dt.getMonth() + m);
    return dt.toISOString().slice(0, 10);
  };

  if (forceReset) {
    db.exec(`
      DELETE FROM banking_transactions_demo;
      DELETE FROM banking_bills_demo;
      DELETE FROM banking_beneficiaries;
      DELETE FROM banking_cards;
      DELETE FROM banking_savings;
      DELETE FROM banking_loans;
      DELETE FROM banking_budgets;
      DELETE FROM banking_notifications;
      DELETE FROM banking_security_state;
      DELETE FROM banking_payment_requests;
      DELETE FROM banking_investments;
      DELETE FROM banking_savings_goals;
      DELETE FROM banking_support_tickets;
      DELETE FROM banking_ai_bills;
      DELETE FROM banking_accounts_demo WHERE id != 'bank_1';
    `);
    db.prepare(`
      UPDATE banking_accounts_demo
      SET bank_name = ?, account_number = ?, holder_name = ?, balance = ?, available_balance = ?, held_balance = ?,
          account_type = ?, daily_limit = ?, monthly_limit = ?, status = ?, opened_at = ?, pin_hash = ?,
          nickname = ?, avatar = ?, is_hidden = 0, is_primary = 1, package_tier = 'Gold Hikari', owner_type = 'user',
          character_id = '', account_role = 'payment', financial_personality = 'balanced'
      WHERE id = 'bank_1'
    `).run(
      'Hikari Bank',
      '8800-2026-9901',
      'Minh Anh',
      28450000,
      27950000,
      500000,
      'Tài khoản Thanh toán Chính',
      100000000,
      500000000,
      'Đang hoạt động',
      '2024-03-15',
      '',
      'Tài khoản Chính Hikari',
      '/src/assets/images/char_sakura_1794880090451.jpg'
    );
  }

  // Upgrade primary user account & safely rebrand legacy PhoneBank labels to Hikari Bank
  db.prepare(
    "UPDATE banking_accounts_demo SET bank_name = 'Hikari Bank' WHERE bank_name IN ('PHONE BANK (Mô phỏng)', 'PhoneBank Premier', 'PhoneBank', '')"
  ).run();

  const acc = db.prepare('SELECT * FROM banking_accounts_demo WHERE id = ?').get('bank_1') as
    | {
        id: string;
        balance: number;
        available_balance: number;
        held_balance: number;
        bank_name: string;
        nickname?: string;
        is_primary?: number;
      }
    | undefined;
  if (acc) {
    if (acc.available_balance === 0 && acc.balance > 0) {
      const held = acc.held_balance || 0;
      db.prepare('UPDATE banking_accounts_demo SET available_balance = ? WHERE id = ?').run(
        Math.max(0, acc.balance - held),
        acc.id
      );
    }
    if (!acc.nickname || acc.nickname === 'Tài khoản Chính Premier') {
      db.prepare(
        "UPDATE banking_accounts_demo SET nickname = 'Tài khoản Chính Hikari', is_primary = 1, owner_type = 'user', account_role = 'payment', package_tier = 'Gold Hikari', avatar = COALESCE(NULLIF(avatar, ''), '/src/assets/images/char_sakura_1794880090451.jpg') WHERE id = 'bank_1'"
      ).run();
    }
  }

  // Seed secondary user sub-account if missing
  const userSubCount = (
    db.prepare("SELECT COUNT(*) as c FROM banking_accounts_demo WHERE owner_type = 'user'").get() as { c: number }
  ).c;
  if (userSubCount <= 1) {
    db.prepare(`
      INSERT OR IGNORE INTO banking_accounts_demo (
        id, bank_name, account_number, holder_name, balance, pin_hash,
        account_type, available_balance, held_balance, daily_limit, monthly_limit, status, opened_at,
        nickname, avatar, is_hidden, is_primary, package_tier, owner_type, character_id, account_role,
        financial_personality, monthly_income, monthly_expense
      ) VALUES (
        'bank_sub_1', 'Hikari Bank', '8800-2026-9902', 'Minh Anh', 4500000, '',
        'Tài khoản Phụ Chi tiêu', 4500000, 0, 50000000, 200000000, 'Đang hoạt động', '2025-01-10',
        'Ví Du lịch & Cà phê', '/src/assets/images/char_sakura_1794880090451.jpg', 0, 0, 'Standard', 'user', '', 'sub',
        'balanced', 0, 0
      )
    `).run();
  }

  // Ensure every AI character has an individual bank account
  try {
    const chars = db.prepare('SELECT id FROM characters').all() as Array<{ id: string }>;
    for (const c of chars) {
      ensureAiCharacterBankAccount(db, c.id);
    }
  } catch {
    // ignore if characters table not ready
  }

  // Seed AI character transactions if missing
  const aiTxCount = (
    db.prepare("SELECT COUNT(*) as c FROM banking_transactions_demo WHERE is_ai_tx = 1").get() as { c: number }
  ).c;
  if (aiTxCount === 0) {
    const insAiTx = db.prepare(`
      INSERT OR IGNORE INTO banking_transactions_demo
      (id, account_id, tx_type, amount, counterparty, note, status, created_at, category, channel, bank_name, account_number, fee, balance_after, ref_code, receipt_json, bill_template, sender_name, sender_account, is_ai_tx)
      VALUES (?, ?, ?, ?, ?, ?, 'Thành công', ?, ?, ?, 'PhoneBank Premier', ?, 0, ?, ?, '{}', ?, ?, ?, 1)
    `);
    insAiTx.run(
      'tx_ai_yuki_1',
      'ai_acc_char_yuki',
      'income',
      24000000,
      'Sound Atelier Studio',
      'Thù lao phối âm & sáng tác lo-fi tháng 11',
      daysAgo(4, 10),
      'Thu nhập',
      'Chuyển khoản 24/7',
      '007100112233',
      18650000,
      'PB261112AI01',
      'receive',
      'Sound Atelier Studio',
      '007100112233'
    );
    insAiTx.run(
      'tx_ai_yuki_2',
      'ai_acc_char_yuki',
      'expense',
      265000,
      'Shibuya Vinyl & Matcha',
      'Mua đĩa than và matcha latte',
      daysAgo(1, 16),
      'Ăn uống',
      'Quét QR',
      'QR-SHIBUYA',
      18650000,
      'PB261115AI02',
      'ai_tx',
      'Yuki Shirakawa',
      '8800-2026-7712'
    );
    insAiTx.run(
      'tx_ai_akira_1',
      'ai_acc_char_akira',
      'income',
      55000000,
      'Kuro Systems Architecture',
      'Thu nhập tư vấn kiến trúc hệ thống',
      daysAgo(3, 11),
      'Thu nhập',
      'Chuyển khoản 24/7',
      '190344556677',
      64200000,
      'PB261113AI03',
      'receive',
      'Kuro Systems Architecture',
      '190344556677'
    );
    insAiTx.run(
      'tx_ai_sakura_1',
      'ai_acc_char_sakura',
      'expense',
      890000,
      'Fujifilm 35mm Lab',
      'Mua 3 cuộn phim màu và tráng phim',
      daysAgo(2, 15),
      'Mua sắm',
      'Thẻ thanh toán',
      '9704-LAB-35',
      4850000,
      'PB261114AI04',
      'shopping',
      'Sakura Hinata',
      '8800-2026-1111'
    );
    insAiTx.run(
      'tx_ai_rin_1',
      'ai_acc_char_rin',
      'income',
      34000000,
      'Kaizen Press Editorial',
      'Thù lao giám đốc nghệ thuật tháng 11',
      daysAgo(5, 9),
      'Thu nhập',
      'Chuyển khoản 24/7',
      '007100994411',
      32900000,
      'PB261111AI05',
      'receive',
      'Kaizen Press Editorial',
      '007100994411'
    );
  }

  // Richer multi-month user transactions
  const txCount = (
    db.prepare("SELECT COUNT(*) as c FROM banking_transactions_demo WHERE account_id = 'bank_1'").get() as { c: number }
  ).c;
  if (txCount <= 2) {
    const insTx = db.prepare(`
      INSERT OR IGNORE INTO banking_transactions_demo
      (id, account_id, tx_type, amount, counterparty, note, status, created_at, category, channel, bank_name, account_number, fee, balance_after, ref_code, receipt_json, bill_template, sender_name, sender_account)
      VALUES (?, 'bank_1', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const seedTxs: Array<
      [string, string, number, string, string, string, string, string, string, string, string, number, number, string, string, string, string]
    > = [
      ['tx_seed_1', 'income', 22000000, 'Công ty Công nghệ Horizon VN', 'Lương tháng 11/2026', 'Thành công', daysAgo(2, 9), 'Thu nhập', 'Chuyển khoản 24/7', 'Vietcombank', '0071000842119', 0, 28450000, 'PB2611148801', 'receive', 'Công ty Công nghệ Horizon VN', '0071000842119'],
      ['tx_seed_2', 'expense', 185000, 'Highlands Coffee Shibuya', 'Cà phê & bánh sáng', 'Thành công', daysAgo(1, 8), 'Ăn uống', 'Quét QR', 'PhoneBank', 'QR-88412', 0, 28265000, 'PB2611151029', 'transfer', 'Minh Anh', '8800-2026-9901'],
      ['tx_seed_3', 'expense', 640000, 'Uniqlo Flagship Store', 'Mua áo khoác thu đông', 'Thành công', daysAgo(3, 19), 'Mua sắm', 'Thẻ thanh toán', 'PhoneBank Card', '4895-••••-3108', 0, 28905000, 'PB2611134512', 'shopping', 'Minh Anh', '8800-2026-9901'],
      ['tx_seed_4', 'expense', 142000, 'PhoneRide Express', 'Di chuyển sân bay & nội thành', 'Thành công', daysAgo(4, 17), 'Đi lại', 'Thanh toán ví', 'PhoneRide', 'RIDE-9921', 0, 29047000, 'PB2611127731', 'bill', 'Minh Anh', '8800-2026-9901'],
      ['tx_seed_5', 'expense', 4200000, 'Khu căn hộ RiverGate', 'Phí quản lý & thuê nhà tháng 11', 'Thành công', daysAgo(6, 10), 'Nhà ở', 'Chuyển khoản 24/7', 'Techcombank', '19033941284011', 0, 33247000, 'PB2611109920', 'bill', 'Minh Anh', '8800-2026-9901'],
      ['tx_seed_6', 'expense', 320000, 'CGV IMAX Cinema', 'Vé xem phim & combo cuối tuần', 'Thành công', daysAgo(8, 20), 'Giải trí', 'Thanh toán trực tuyến', 'MB Bank', '0901223841', 0, 33567000, 'PB2611085510', 'shopping', 'Minh Anh', '8800-2026-9901'],
      ['tx_seed_7', 'income', 145000, 'Lãi tiết kiệm định kỳ', 'Tiền lãi sổ Tiết kiệm Online #TK-204', 'Thành công', daysAgo(10, 7), 'Tiền lãi', 'Tự động', 'PhoneBank', 'TK-204', 0, 33712000, 'PB2611060012', 'savings_settle', 'PhoneBank Savings', 'TK-204'],
      ['tx_seed_8', 'expense', 950000, 'Bệnh viện Quốc tế VinMed', 'Khám sức khỏe định kỳ', 'Thành công', daysAgo(14, 11), 'Sức khỏe', 'Thanh toán hóa đơn', 'BIDV', '2151000412981', 0, 34662000, 'PB2611024418', 'bill', 'Minh Anh', '8800-2026-9901'],
      ['tx_seed_9', 'expense', 1200000, 'Nihongo Academy Online', 'Học phí khóa JLPT N2', 'Thành công', daysAgo(18, 15), 'Học tập', 'Thanh toán hóa đơn', 'ACB', '149201841', 0, 35862000, 'PB2610291182', 'bill', 'Minh Anh', '8800-2026-9901'],
      ['tx_seed_10', 'income', 21500000, 'Công ty Công nghệ Horizon VN', 'Lương tháng 10/2026', 'Thành công', monthsAgo(1, 5), 'Thu nhập', 'Chuyển khoản 24/7', 'Vietcombank', '0071000842119', 0, 37062000, 'PB2610058821', 'receive', 'Công ty Công nghệ Horizon VN', '0071000842119'],
      ['tx_seed_11', 'expense', 5400000, 'Tổng chi sinh hoạt tháng 10', 'Ăn uống, mua sắm & tiện ích tháng 10', 'Thành công', monthsAgo(1, 20), 'Nhà ở', 'Tổng hợp', 'PhoneBank', '8800-2026-9901', 0, 31662000, 'PB2610207711', 'transfer', 'Minh Anh', '8800-2026-9901'],
      ['tx_seed_12', 'income', 20500000, 'Công ty Công nghệ Horizon VN', 'Lương tháng 09/2026', 'Thành công', monthsAgo(2, 5), 'Thu nhập', 'Chuyển khoản 24/7', 'Vietcombank', '0071000842119', 0, 35100000, 'PB2609053310', 'receive', 'Công ty Công nghệ Horizon VN', '0071000842119'],
      ['tx_seed_13', 'expense', 6100000, 'Tổng chi sinh hoạt tháng 09', 'Nhà ở, ăn uống & du lịch tháng 09', 'Thành công', monthsAgo(2, 22), 'Du lịch', 'Tổng hợp', 'PhoneBank', '8800-2026-9901', 0, 29000000, 'PB2609224109', 'transfer', 'Minh Anh', '8800-2026-9901'],
    ];
    for (const r of seedTxs) {
      insTx.run(
        r[0],
        r[1],
        r[2],
        r[3],
        r[4],
        r[5],
        r[6],
        r[7],
        r[8],
        r[9],
        r[10],
        r[11],
        r[12],
        r[13],
        JSON.stringify({
          refCode: r[13],
          channel: r[8],
          bankName: r[9],
          accountNumber: r[10],
          category: r[7],
          fee: r[11],
          template: r[14],
          senderName: r[15],
          senderAccount: r[16],
          recipientName: r[1] === 'income' ? 'Minh Anh' : r[3],
          recipientAccount: r[1] === 'income' ? '8800-2026-9901' : r[10],
          amount: r[2],
          totalAmount: r[2] + r[11],
          note: r[4],
          createdAt: r[6],
          status: r[5],
        }),
        r[14],
        r[15],
        r[16]
      );
    }
    db.prepare("UPDATE banking_transactions_demo SET category = 'Thu nhập', channel = 'Khởi tạo', ref_code = 'PB2611010001', bill_template = 'receive' WHERE id = 'tx_1'").run();
    db.prepare("UPDATE banking_transactions_demo SET category = 'Khác', channel = 'Nội bộ', ref_code = 'PB2611010002', bill_template = 'transfer' WHERE id = 'tx_2'").run();
  }

  // Bills enrichment (10 categories supported)
  if ((db.prepare('SELECT COUNT(*) as c FROM banking_bills_demo').get() as { c: number }).c <= 3) {
    const insBill = db.prepare(`
      INSERT OR IGNORE INTO banking_bills_demo (id, provider, bill_type, amount, due_date, is_paid, paid_at, customer_code, is_saved, recurring_enabled, recurring_day)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insBill.run('bill_1', 'Điện lực EVN-Sim', 'Điện', 420000, '2026-11-25', 0, '', 'PE0900184921', 1, 0, 0);
    insBill.run('bill_2', 'Nước sạch Sawaco-Sim', 'Nước', 145000, '2026-11-26', 0, '', 'WTR4410291', 1, 0, 0);
    insBill.run('bill_3', 'Internet Fiber 500Mbps', 'Internet', 290000, '2026-11-28', 0, '', 'NET9912840', 1, 1, 28);
    insBill.run('bill_4', 'Truyền hình FPT Play VIP', 'Truyền hình', 120000, '2026-11-29', 0, '', 'TV774120', 1, 1, 29);
    insBill.run('bill_5', 'Viettel Trả sau 0901234567', 'Điện thoại', 210000, '2026-11-30', 0, '', '0901234567', 1, 0, 0);
    insBill.run('bill_6', 'Học viện Nhật ngữ Tokyo', 'Học phí', 1500000, '2026-12-03', 0, '', 'EDU-202688', 1, 0, 0);
    insBill.run('bill_7', 'Khu căn hộ RiverGate', 'Thuê nhà', 4200000, '2026-12-05', 0, '', 'APT-B1204', 1, 1, 5);
  }
  db.prepare("UPDATE banking_bills_demo SET customer_code = 'PE0900184921', is_saved = 1 WHERE id = 'bill_1' AND COALESCE(customer_code, '') = ''").run();
  db.prepare("UPDATE banking_bills_demo SET customer_code = 'WTR4410291', is_saved = 1 WHERE id = 'bill_2' AND COALESCE(customer_code, '') = ''").run();
  db.prepare("UPDATE banking_bills_demo SET customer_code = 'NET9912840', is_saved = 1, recurring_enabled = 1, recurring_day = 28 WHERE id = 'bill_3' AND COALESCE(customer_code, '') = ''").run();

  // AI Character recurring bills
  if ((db.prepare('SELECT COUNT(*) as c FROM banking_ai_bills').get() as { c: number }).c === 0) {
    const insAiBill = db.prepare(`
      INSERT INTO banking_ai_bills (id, character_id, title, bill_type, amount, due_date, is_paid, recurring_enabled, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
    `);
    insAiBill.run('aibill_1', 'char_yuki', 'Thuê phòng thu âm Shibuya', 'Thuê nhà', 3500000, '2026-11-28', 1, now);
    insAiBill.run('aibill_2', 'char_sakura', 'Phí rửa ảnh & studio 35mm', 'Mua sắm', 650000, '2026-11-27', 1, now);
    insAiBill.run('aibill_3', 'char_akira', 'Gói Cloud Server Kuro Systems', 'Internet', 920000, '2026-11-30', 1, now);
    insAiBill.run('aibill_4', 'char_rin', 'Bản quyền Font & In ấn Kaizen', 'Dịch vụ khác', 1100000, '2026-12-02', 1, now);
  }

  // Beneficiaries
  if ((db.prepare('SELECT COUNT(*) as c FROM banking_beneficiaries').get() as { c: number }).c === 0) {
    const insBen = db.prepare(`
      INSERT INTO banking_beneficiaries (id, name, account_number, bank_code, bank_name, is_internal, alias, is_favorite, last_used_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insBen.run('ben_1', 'Yuki Shirakawa', '8800-2026-7712', 'HIKARI', 'Hikari Bank', 1, 'Yuki', 1, daysAgo(1, 14));
    insBen.run('ben_2', 'Akira Kurosawa', '8800-2026-4405', 'HIKARI', 'Hikari Bank', 1, 'Akira', 1, daysAgo(3, 11));
    insBen.run('ben_3', 'Sakura Hinata', '8800-2026-1111', 'HIKARI', 'Hikari Bank', 1, 'Sakura', 1, daysAgo(2, 16));
    insBen.run('ben_4', 'Rin Tachibana', '8800-2026-2222', 'HIKARI', 'Hikari Bank', 1, 'Rin', 0, daysAgo(5, 11));
    insBen.run('ben_5', 'Nguyễn Thảo Vy', '19035884120911', 'TCB', 'Techcombank', 0, 'Chị Vy', 1, daysAgo(6, 9));
    insBen.run('ben_6', 'Lê Minh Tuấn', '0071000912841', 'VCB', 'Vietcombank', 0, 'Tuấn Dev', 0, daysAgo(9, 16));
  } else {
    db.prepare(
      "UPDATE banking_beneficiaries SET bank_code = 'HIKARI', bank_name = 'Hikari Bank' WHERE bank_code = 'PHONEBANK' OR bank_name IN ('PhoneBank Premier', 'PhoneBank')"
    ).run();
  }

  // Bank Cards — STRICT SECURITY: never store or expose real CVV ('•••')
  if ((db.prepare('SELECT COUNT(*) as c FROM banking_cards').get() as { c: number }).c === 0) {
    const insCard = db.prepare(`
      INSERT INTO banking_cards (id, account_id, card_type, card_name, card_nickname, masked_number, last4, expiry, cvv, holder_name, status, online_payment_enabled, contactless_enabled, daily_limit, monthly_limit, spent_month, credit_limit, pin_hash, design_theme, is_primary, created_at)
      VALUES (?, 'bank_1', ?, ?, ?, ?, ?, ?, '•••', 'MINH ANH', ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?)
    `);
    insCard.run('card_1', 'hikari_classic', 'Hikari Classic Debit', 'Hikari Classic Debit', '9704 •••• •••• 1042', '1042', '08/29', 'active', 1, 1, 50000000, 200000000, 3200000, 0, 'coral', 1, monthsAgo(10));
    insCard.run('card_2', 'hikari_premier', 'Hikari Premier Global', 'Hikari Premier Global', '4895 •••• •••• 3108', '3108', '11/30', 'active', 1, 1, 80000000, 300000000, 6400000, 0, 'sumi', 0, monthsAgo(6));
    insCard.run('card_3', 'hikari_anime', 'Hikari Anime Edition', 'Hikari Anime Edition', '5421 •••• •••• 8890', '8890', '05/31', 'active', 1, 1, 150000000, 500000000, 12800000, 150000000, 'sakura', 0, monthsAgo(3));
    insCard.run('card_4', 'hikari_character', 'Hikari Character Edition', 'Hikari Character Edition', '4111 •••• •••• 5520', '5520', '09/29', 'active', 1, 1, 40000000, 120000000, 4150000, 60000000, 'sunrise', 0, monthsAgo(8));
  } else {
    db.prepare("UPDATE banking_cards SET cvv = '•••' WHERE cvv != '•••'").run();
  }

  // Savings Books
  if ((db.prepare('SELECT COUNT(*) as c FROM banking_savings').get() as { c: number }).c === 0) {
    const insSav = db.prepare(`
      INSERT INTO banking_savings (id, account_id, product_type, product_name, principal, interest_rate, term_months, opened_at, maturity_date, expected_interest, auto_renew, status, settled_at, actual_payout)
      VALUES (?, 'bank_1', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const exp1 = Math.round(20000000 * (5.6 / 100) * (6 / 12));
    insSav.run('sav_1', 'online', 'Tiết kiệm Online 6 tháng', 20000000, 5.6, 6, monthsAgo(2).slice(0, 10), monthsAhead(4), exp1, 1, 'active', '', 0);
    const exp2 = Math.round(12000000 * (4.8 / 100) * (12 / 12));
    insSav.run('sav_2', 'accumulation', 'Tích lũy Mục tiêu Nhật Bản', 12000000, 4.8, 12, monthsAgo(4).slice(0, 10), monthsAhead(8), exp2, 0, 'active', '', 0);
    const exp3 = Math.round(10000000 * (5.2 / 100) * (3 / 12));
    insSav.run('sav_3', 'term', 'Tiết kiệm Có kỳ hạn 3 tháng', 10000000, 5.2, 3, monthsAgo(5).slice(0, 10), monthsAgo(2).slice(0, 10), exp3, 0, 'settled', monthsAgo(2), 10000000 + exp3);
  }

  // Loans
  if ((db.prepare('SELECT COUNT(*) as c FROM banking_loans').get() as { c: number }).c === 0) {
    const startIso = monthsAgo(3);
    const { monthlyPayment, schedule } = buildLoanSchedule(36000000, 11.5, 12, startIso, 3);
    const remaining = schedule[2]?.remainingBalance ?? 27500000;
    const nextDue = schedule[3]?.dueDate || monthsAhead(1);
    db.prepare(`
      INSERT INTO banking_loans (id, account_id, loan_type, loan_name, principal, remaining_balance, interest_rate, term_months, monthly_payment, paid_months, next_due_date, status, schedule_json, created_at, counterparty_char_id, direction)
      VALUES (?, 'bank_1', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', 'borrow')
    `).run(
      'loan_1',
      'consumer',
      'Vay Tiêu dùng Tín chấp Ưu đãi',
      36000000,
      remaining,
      11.5,
      12,
      monthlyPayment,
      3,
      nextDue,
      'active',
      JSON.stringify(schedule),
      startIso
    );
  }

  // Investments Portfolio
  if ((db.prepare('SELECT COUNT(*) as c FROM banking_investments').get() as { c: number }).c === 0) {
    const insInv = db.prepare(`
      INSERT INTO banking_investments (id, account_id, asset_code, asset_name, asset_type, units, avg_buy_price, current_price, invested_amount, status, updated_at)
      VALUES (?, 'bank_1', ?, ?, ?, ?, ?, ?, ?, 'active', ?)
    `);
    insInv.run('inv_1', 'PBFUND', 'Quỹ Mở Tăng Trưởng PB-VN30', 'fund', 120, 42000, 45500, 5040000, now);
    insInv.run('inv_2', 'GOLD99', 'Vàng Kỹ Thuật Số 9999', 'gold', 0.5, 8200000, 8650000, 4100000, now);
  }

  // Savings Goals
  if ((db.prepare('SELECT COUNT(*) as c FROM banking_savings_goals').get() as { c: number }).c === 0) {
    const insGoal = db.prepare(`
      INSERT INTO banking_savings_goals (id, account_id, title, target_amount, current_amount, deadline, category, auto_save_amount, status, created_at)
      VALUES (?, 'bank_1', ?, ?, ?, ?, ?, ?, 'active', ?)
    `);
    insGoal.run('goal_1', 'Chuyến du lịch Tokyo mùa hoa anh đào', 35000000, 14500000, '2027-03-30', 'Du lịch', 2000000, now);
    insGoal.run('goal_2', 'Quỹ dự phòng khẩn cấp 6 tháng', 50000000, 22000000, '2027-08-01', 'Khác', 3000000, now);
  }

  // Budgets (10 expense categories from Part 10)
  if ((db.prepare('SELECT COUNT(*) as c FROM banking_budgets').get() as { c: number }).c === 0) {
    const insBudget = db.prepare(`
      INSERT INTO banking_budgets (id, category, monthly_limit, alert_threshold)
      VALUES (?, ?, ?, ?)
    `);
    insBudget.run('bud_1', 'Ăn uống', 3500000, 80);
    insBudget.run('bud_2', 'Mua sắm', 2500000, 80);
    insBudget.run('bud_3', 'Đi lại', 1500000, 80);
    insBudget.run('bud_4', 'Nhà ở', 5500000, 85);
    insBudget.run('bud_5', 'Giải trí', 1200000, 80);
    insBudget.run('bud_6', 'Học tập', 2000000, 85);
    insBudget.run('bud_7', 'Sức khỏe', 1500000, 80);
    insBudget.run('bud_8', 'Du lịch', 3000000, 80);
    insBudget.run('bud_9', 'Chuyển khoản', 5000000, 85);
    insBudget.run('bud_10', 'Khác', 2000000, 80);
  }

  // Support Tickets
  if ((db.prepare('SELECT COUNT(*) as c FROM banking_support_tickets').get() as { c: number }).c === 0) {
    db.prepare(`
      INSERT INTO banking_support_tickets (id, category, subject, description, tx_ref, status, admin_reply, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'resolved', ?, ?, ?)
    `).run(
      'tkt_seed_1',
      'Xác nhận giao dịch',
      'Kiểm tra trạng thái thanh toán thẻ Uniqlo',
      'Giao dịch thẻ quốc tế ngày 14/11 hiển thị chờ xác nhận nay đã quyết toán xong chưa?',
      'PB2611134512',
      'PhoneBank Support: Giao dịch PB2611134512 trị giá 640.000đ đã quyết toán thành công và không phát sinh phí ngoại tệ.',
      daysAgo(2, 14),
      daysAgo(2, 15)
    );
  }

  // Banking Notifications
  if ((db.prepare('SELECT COUNT(*) as c FROM banking_notifications').get() as { c: number }).c === 0) {
    const insNotif = db.prepare(`
      INSERT INTO banking_notifications (id, notif_type, title, body, amount, is_read, ref_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insNotif.run('bnotif_1', 'receive', 'Nhận tiền thành công', '+22.000.000đ từ Công ty Công nghệ Horizon VN · Lương tháng 11/2026', 22000000, 0, 'tx_seed_1', daysAgo(2, 9));
    insNotif.run('bnotif_2', 'interest', 'Tiền lãi tiết kiệm định kỳ', '+145.000đ tiền lãi sổ Tiết kiệm Online #TK-204 đã cộng vào tài khoản', 145000, 0, 'tx_seed_7', daysAgo(10, 7));
    insNotif.run('bnotif_3', 'due', 'Sắp đến hạn thanh toán hóa đơn', 'Hóa đơn Điện lực EVN-Sim 420.000đ đến hạn ngày 25/11/2026', -420000, 0, 'bill_1', daysAgo(1, 11));
    insNotif.run('bnotif_4', 'security', 'Đăng nhập từ thiết bị mới', 'PhoneOS Mobile Android đã đăng nhập thành công lúc 08:15 hôm nay.', 0, 1, '', now);
  }

  // Security & Profile State
  if ((db.prepare('SELECT COUNT(*) as c FROM banking_security_state').get() as { c: number }).c === 0) {
    db.prepare(`
      INSERT INTO banking_security_state (
        id, login_password_hash, biometric_enabled, notif_balance, notif_security, notif_promo,
        kyc_status, id_number, kyc_verified_at, unusual_alert_active, devices_json, login_logs_json,
        app_lock_enabled, is_logged_out, failed_pin_count, dob, phone, email, address, reward_points
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, '2003-05-18', '0901 884 206', 'minhanh@phoneos.local', 'Quận 1, TP. Hồ Chí Minh', 1480)
    `).run(
      'sec_1',
      hashSecretLocal('PhoneBank@2026'),
      1,
      1,
      1,
      0,
      'Đã định danh eKYC cấp 2',
      '0792•••••841',
      '2024-03-15',
      0,
      JSON.stringify([
        { id: 'dev_1', name: 'PhoneOS 4.0 Pro (Thiết bị hiện tại)', os: 'Android 16 · PhoneOS', location: 'TP. Hồ Chí Minh', lastActive: 'Đang hoạt động', current: true },
        { id: 'dev_2', name: 'Chrome Desktop Studio', os: 'Linux Web', location: 'TP. Hồ Chí Minh', lastActive: '2 ngày trước', current: false },
      ]),
      JSON.stringify([
        { id: 'log_1', action: 'Đăng nhập bằng Sinh trắc học', device: 'PhoneOS 4.0 Pro', time: daysAgo(0, 8), status: 'An toàn' },
        { id: 'log_2', action: 'Cập nhật hạn mức ngày 100.000.000đ', device: 'PhoneOS 4.0 Pro', time: daysAgo(3, 14), status: 'Đã xác thực' },
        { id: 'log_3', action: 'Đăng nhập trình duyệt mới', device: 'Chrome Desktop Studio', time: daysAgo(5, 19), status: 'Cảnh báo đã xác nhận' },
      ])
    );
  }

  if (forceReset) {
    try {
      seedCardSystemData(db, true);
    } catch {
      // card tables are created by initCardSystemDatabase
    }
  }
}

export function initBankingDatabase(db: Database.Database): void {
  // Multi-account & AI character account columns
  ensureColumn(db, 'banking_accounts_demo', 'account_type', "TEXT DEFAULT 'Tài khoản Thanh toán Ưu tiên'");
  ensureColumn(db, 'banking_accounts_demo', 'available_balance', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'banking_accounts_demo', 'held_balance', 'INTEGER DEFAULT 500000');
  ensureColumn(db, 'banking_accounts_demo', 'daily_limit', 'INTEGER DEFAULT 100000000');
  ensureColumn(db, 'banking_accounts_demo', 'monthly_limit', 'INTEGER DEFAULT 500000000');
  ensureColumn(db, 'banking_accounts_demo', 'status', "TEXT DEFAULT 'Đang hoạt động'");
  ensureColumn(db, 'banking_accounts_demo', 'opened_at', "TEXT DEFAULT '2024-03-15'");
  ensureColumn(db, 'banking_accounts_demo', 'nickname', "TEXT DEFAULT ''");
  ensureColumn(db, 'banking_accounts_demo', 'avatar', "TEXT DEFAULT ''");
  ensureColumn(db, 'banking_accounts_demo', 'is_hidden', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'banking_accounts_demo', 'is_primary', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'banking_accounts_demo', 'package_tier', "TEXT DEFAULT 'Premier'");
  ensureColumn(db, 'banking_accounts_demo', 'owner_type', "TEXT DEFAULT 'user'");
  ensureColumn(db, 'banking_accounts_demo', 'character_id', "TEXT DEFAULT ''");
  ensureColumn(db, 'banking_accounts_demo', 'account_role', "TEXT DEFAULT 'payment'");
  ensureColumn(db, 'banking_accounts_demo', 'financial_personality', "TEXT DEFAULT 'balanced'");
  ensureColumn(db, 'banking_accounts_demo', 'monthly_income', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'banking_accounts_demo', 'monthly_expense', 'INTEGER DEFAULT 0');

  // Richer transaction & bill template columns
  ensureColumn(db, 'banking_transactions_demo', 'category', "TEXT DEFAULT 'Khác'");
  ensureColumn(db, 'banking_transactions_demo', 'channel', "TEXT DEFAULT 'Chuyển khoản 24/7'");
  ensureColumn(db, 'banking_transactions_demo', 'bank_name', "TEXT DEFAULT 'PhoneBank'");
  ensureColumn(db, 'banking_transactions_demo', 'account_number', "TEXT DEFAULT ''");
  ensureColumn(db, 'banking_transactions_demo', 'fee', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'banking_transactions_demo', 'balance_after', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'banking_transactions_demo', 'ref_code', "TEXT DEFAULT ''");
  ensureColumn(db, 'banking_transactions_demo', 'receipt_json', "TEXT DEFAULT '{}'");
  ensureColumn(db, 'banking_transactions_demo', 'bill_template', "TEXT DEFAULT 'transfer'");
  ensureColumn(db, 'banking_transactions_demo', 'linked_ref', "TEXT DEFAULT ''");
  ensureColumn(db, 'banking_transactions_demo', 'sender_name', "TEXT DEFAULT ''");
  ensureColumn(db, 'banking_transactions_demo', 'sender_account', "TEXT DEFAULT ''");
  ensureColumn(db, 'banking_transactions_demo', 'sender_avatar', "TEXT DEFAULT ''");
  ensureColumn(db, 'banking_transactions_demo', 'recipient_avatar', "TEXT DEFAULT ''");
  ensureColumn(db, 'banking_transactions_demo', 'client_tx_id', "TEXT DEFAULT ''");
  ensureColumn(db, 'banking_transactions_demo', 'target_account_id', "TEXT DEFAULT ''");
  ensureColumn(db, 'banking_transactions_demo', 'is_ai_tx', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'banking_transactions_demo', 'bill_image_url', "TEXT DEFAULT ''");
  ensureColumn(db, 'banking_transactions_demo', 'receipt_sig', "TEXT DEFAULT ''");

  ensureColumn(db, 'banking_bills_demo', 'customer_code', "TEXT DEFAULT ''");
  ensureColumn(db, 'banking_bills_demo', 'is_saved', 'INTEGER DEFAULT 1');
  ensureColumn(db, 'banking_bills_demo', 'recurring_enabled', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'banking_bills_demo', 'recurring_day', 'INTEGER DEFAULT 0');

  db.exec(`
    CREATE TABLE IF NOT EXISTS banking_beneficiaries (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      account_number TEXT NOT NULL,
      bank_code TEXT NOT NULL,
      bank_name TEXT NOT NULL,
      is_internal INTEGER DEFAULT 0,
      alias TEXT DEFAULT '',
      is_favorite INTEGER DEFAULT 0,
      last_used_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS banking_cards (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      card_type TEXT NOT NULL,
      card_name TEXT NOT NULL,
      masked_number TEXT NOT NULL,
      last4 TEXT NOT NULL,
      expiry TEXT NOT NULL,
      cvv TEXT NOT NULL,
      holder_name TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      online_payment_enabled INTEGER DEFAULT 1,
      contactless_enabled INTEGER DEFAULT 1,
      daily_limit INTEGER DEFAULT 50000000,
      monthly_limit INTEGER DEFAULT 200000000,
      spent_month INTEGER DEFAULT 0,
      credit_limit INTEGER DEFAULT 0,
      pin_hash TEXT DEFAULT '',
      design_theme TEXT DEFAULT 'navy',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS banking_savings (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      product_type TEXT NOT NULL,
      product_name TEXT NOT NULL,
      principal INTEGER NOT NULL,
      interest_rate REAL NOT NULL,
      term_months REAL NOT NULL,
      opened_at TEXT NOT NULL,
      maturity_date TEXT NOT NULL,
      expected_interest INTEGER NOT NULL,
      auto_renew INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      settled_at TEXT DEFAULT '',
      actual_payout INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS banking_loans (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      loan_type TEXT NOT NULL,
      loan_name TEXT NOT NULL,
      principal INTEGER NOT NULL,
      remaining_balance INTEGER NOT NULL,
      interest_rate REAL NOT NULL,
      term_months INTEGER NOT NULL,
      monthly_payment INTEGER NOT NULL,
      paid_months INTEGER DEFAULT 0,
      next_due_date TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      schedule_json TEXT DEFAULT '[]',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS banking_budgets (
      id TEXT PRIMARY KEY,
      category TEXT UNIQUE NOT NULL,
      monthly_limit INTEGER NOT NULL,
      alert_threshold INTEGER DEFAULT 80
    );

    CREATE TABLE IF NOT EXISTS banking_notifications (
      id TEXT PRIMARY KEY,
      notif_type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      amount INTEGER DEFAULT 0,
      is_read INTEGER DEFAULT 0,
      ref_id TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS banking_security_state (
      id TEXT PRIMARY KEY,
      login_password_hash TEXT DEFAULT '',
      biometric_enabled INTEGER DEFAULT 1,
      notif_balance INTEGER DEFAULT 1,
      notif_security INTEGER DEFAULT 1,
      notif_promo INTEGER DEFAULT 0,
      kyc_status TEXT DEFAULT 'Đã định danh eKYC cấp 2',
      id_number TEXT DEFAULT '0792•••••841',
      kyc_verified_at TEXT DEFAULT '2024-03-15',
      unusual_alert_active INTEGER DEFAULT 0,
      devices_json TEXT DEFAULT '[]',
      login_logs_json TEXT DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS banking_payment_requests (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      target_character_id TEXT DEFAULT '',
      requester_name TEXT NOT NULL,
      amount INTEGER NOT NULL,
      note TEXT DEFAULT '',
      qr_payload TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      ref_tx_id TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS banking_investments (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      asset_code TEXT NOT NULL,
      asset_name TEXT NOT NULL,
      asset_type TEXT NOT NULL,
      units REAL NOT NULL,
      avg_buy_price INTEGER NOT NULL,
      current_price INTEGER NOT NULL,
      invested_amount INTEGER NOT NULL,
      status TEXT DEFAULT 'active',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS banking_savings_goals (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      title TEXT NOT NULL,
      target_amount INTEGER NOT NULL,
      current_amount INTEGER DEFAULT 0,
      deadline TEXT NOT NULL,
      category TEXT DEFAULT 'Khác',
      auto_save_amount INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS banking_support_tickets (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      subject TEXT NOT NULL,
      description TEXT NOT NULL,
      tx_ref TEXT DEFAULT '',
      status TEXT DEFAULT 'open',
      admin_reply TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS banking_ai_bills (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      title TEXT NOT NULL,
      bill_type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      due_date TEXT NOT NULL,
      is_paid INTEGER DEFAULT 0,
      recurring_enabled INTEGER DEFAULT 1,
      created_at TEXT NOT NULL
    );
  `);

  ensureColumn(db, 'banking_loans', 'counterparty_char_id', "TEXT DEFAULT ''");
  ensureColumn(db, 'banking_loans', 'direction', "TEXT DEFAULT 'borrow'");
  ensureColumn(db, 'banking_security_state', 'app_lock_enabled', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'banking_security_state', 'is_logged_out', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'banking_security_state', 'failed_pin_count', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'banking_security_state', 'dob', "TEXT DEFAULT '2003-05-18'");
  ensureColumn(db, 'banking_security_state', 'phone', "TEXT DEFAULT '0901 884 206'");
  ensureColumn(db, 'banking_security_state', 'email', "TEXT DEFAULT 'minhanh@phoneos.local'");
  ensureColumn(db, 'banking_security_state', 'address', "TEXT DEFAULT 'Quận 1, TP. Hồ Chí Minh'");
  ensureColumn(db, 'banking_security_state', 'reward_points', 'INTEGER DEFAULT 1480');

  // Hikari Bank 3.0 Schema Extensions
  ensureColumn(db, 'banking_transactions_demo', 'completed_at', "TEXT DEFAULT ''");
  ensureColumn(db, 'banking_transactions_demo', 'failure_reason', "TEXT DEFAULT ''");
  ensureColumn(db, 'banking_transactions_demo', 'source_type', "TEXT DEFAULT 'manual_transfer'");
  ensureColumn(db, 'banking_transactions_demo', 'source_chat_id', "TEXT DEFAULT ''");
  ensureColumn(db, 'banking_transactions_demo', 'idempotency_key', "TEXT DEFAULT ''");
  ensureColumn(db, 'banking_transactions_demo', 'total_debit', 'INTEGER DEFAULT 0');

  ensureColumn(db, 'banking_payment_requests', 'description', "TEXT DEFAULT ''");
  ensureColumn(db, 'banking_payment_requests', 'responded_at', "TEXT DEFAULT ''");
  ensureColumn(db, 'banking_payment_requests', 'response_message', "TEXT DEFAULT ''");
  ensureColumn(db, 'banking_payment_requests', 'proposed_amount', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'banking_payment_requests', 'deadline_at', "TEXT DEFAULT ''");
  ensureColumn(db, 'banking_payment_requests', 'source_chat_id', "TEXT DEFAULT ''");
  ensureColumn(db, 'banking_payment_requests', 'idempotency_key', "TEXT DEFAULT ''");
  ensureColumn(db, 'banking_payment_requests', 'transaction_id', "TEXT DEFAULT ''");

  ensureColumn(db, 'banking_security_state', 'customer_code', "TEXT DEFAULT 'HK-CID-202601'");
  ensureColumn(db, 'banking_security_state', 'theme_id', "TEXT DEFAULT 'coral'");
  ensureColumn(db, 'banking_security_state', 'assistant_char_id', "TEXT DEFAULT 'hikari_chan'");
  ensureColumn(db, 'banking_security_state', 'assistant_outfit', "TEXT DEFAULT 'teller_classic'");
  ensureColumn(db, 'banking_security_state', 'assistant_expression', "TEXT DEFAULT 'cheerful'");
  ensureColumn(db, 'banking_security_state', 'unlocked_outfits_json', 'TEXT DEFAULT \'["teller_classic","spring_kimono","premier_suit"]\'');
  ensureColumn(db, 'banking_security_state', 'dashboard_wallpaper', "TEXT DEFAULT 'skyline'");
  ensureColumn(db, 'banking_security_state', 'inactivity_lock_sec', 'INTEGER DEFAULT 180');
  ensureColumn(db, 'banking_security_state', 'privacy_hide_balance', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'banking_security_state', 'hikari_banner_dismissed', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'banking_security_state', 'onboarding_completed', 'INTEGER DEFAULT 1');

  ensureColumn(db, 'banking_cards', 'card_nickname', "TEXT DEFAULT ''");
  ensureColumn(db, 'banking_cards', 'is_primary', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'banking_transactions_demo', 'source_card_id', "TEXT DEFAULT ''");
  ensureColumn(db, 'banking_transactions_demo', 'source_card_last4', "TEXT DEFAULT ''");

  db.exec(`
    CREATE TABLE IF NOT EXISTS banking_receipts (
      receipt_id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL,
      receipt_type TEXT DEFAULT 'transfer',
      render_version TEXT DEFAULT '3.0',
      created_at TEXT NOT NULL,
      image_reference TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS banking_ledger_audit (
      id TEXT PRIMARY KEY,
      operation TEXT NOT NULL,
      tx_id TEXT DEFAULT '',
      account_id TEXT NOT NULL,
      delta INTEGER DEFAULT 0,
      balance_before INTEGER DEFAULT 0,
      balance_after INTEGER DEFAULT 0,
      status TEXT DEFAULT 'ok',
      detail TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_banking_tx_idem
      ON banking_transactions_demo(idempotency_key)
      WHERE idempotency_key != '';

    CREATE UNIQUE INDEX IF NOT EXISTS idx_banking_req_idem
      ON banking_payment_requests(idempotency_key)
      WHERE idempotency_key != '';
  `);

  seedBankingDemoData(db, false);

  // Backfill card_nickname, sync card holder_name with user account holder_name, and ensure a default primary card exists
  db.prepare("UPDATE banking_cards SET card_nickname = COALESCE(NULLIF(card_nickname, ''), card_name)").run();
  const primaryUserHolder = db
    .prepare(
      "SELECT holder_name FROM banking_accounts_demo WHERE COALESCE(owner_type, 'user') = 'user' ORDER BY is_primary DESC, opened_at ASC LIMIT 1"
    )
    .get() as { holder_name?: string } | undefined;
  if (primaryUserHolder?.holder_name?.trim()) {
    db.prepare(
      "UPDATE banking_cards SET holder_name = ? WHERE account_id IN (SELECT id FROM banking_accounts_demo WHERE COALESCE(owner_type, 'user') = 'user') OR account_id = '' OR account_id IS NULL"
    ).run(primaryUserHolder.holder_name.trim().toUpperCase());
  }
  const hasPrimaryCard = (db.prepare("SELECT COUNT(*) as c FROM banking_cards WHERE is_primary = 1 AND status = 'active'").get() as { c: number }).c;
  if (hasPrimaryCard === 0) {
    const firstActive = db.prepare("SELECT id FROM banking_cards WHERE status = 'active' ORDER BY created_at ASC LIMIT 1").get() as { id: string } | undefined;
    if (firstActive) {
      db.prepare('UPDATE banking_cards SET is_primary = 0').run();
      db.prepare('UPDATE banking_cards SET is_primary = 1 WHERE id = ?').run(firstActive.id);
    }
  }

  initCardSystemDatabase(db);
}
