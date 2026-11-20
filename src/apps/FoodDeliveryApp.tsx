import React, { useState } from 'react';
import { Bike, Clock, MapPin, Plus, Star, UtensilsCrossed } from 'lucide-react';
import { useOS } from '../context/OSContext';
import { osApi } from '../services/api';
import type { FoodRestaurant } from '../types/os';
import { UniversalCardCheckoutModal } from '../components/banking/cards/UniversalCardCheckoutModal';

interface MenuItem {
  id: string;
  name: string;
  price: number;
  desc: string;
  toppings: string[];
}

export function FoodDeliveryApp() {
  const { data, refreshData, showToast } = useOS();
  const [tab, setTab] = useState<'browse' | 'orders'>('browse');
  const [selectedRest, setSelectedRest] = useState<FoodRestaurant | null>(null);
  const [tray, setTray] = useState<Array<{ name: string; price: number; topping: string }>>([]);
  const [deliveryAddress, setDeliveryAddress] = useState('120 Pasteur, Quận 1 (Mô phỏng)');
  const [paymentMethod, setPaymentMethod] = useState('Ví mô phỏng PHONE BANK');
  const [cardCheckoutOpen, setCardCheckoutOpen] = useState(false);

  const restaurants = data?.foodRestaurants || [];
  const orders = data?.foodOrders || [];

  const menu: MenuItem[] = selectedRest ? (JSON.parse(selectedRest.menu_json || '[]') as MenuItem[]) : [];
  const pendingTotal = tray.reduce((s, t) => s + t.price, 0) + 15000;

  const submitFoodOrder = async () => {
    if (!selectedRest || tray.length === 0) return;
    await osApi.createFoodOrder({
      restaurant_id: selectedRest.id,
      restaurant_name: selectedRest.name,
      items: tray,
      total: pendingTotal,
      delivery_address: deliveryAddress,
      payment_method: paymentMethod,
    });
    await refreshData();
    setTray([]);
    setSelectedRest(null);
    setTab('orders');
  };

  const placeOrder = async () => {
    if (!selectedRest || tray.length === 0) return;
    if (paymentMethod === 'Thẻ ngân hàng Hikari') {
      setCardCheckoutOpen(true);
      return;
    }
    await submitFoodOrder();
    showToast('Đặt món thành công', 'Tài xế mô phỏng đang chuẩn bị lấy món!', 'success');
  };

  const advanceFoodStatus = async (id: string, current: string) => {
    const flow = ['Đã nhận đơn', 'Đang chế biến', 'Tài xế đang giao', 'Đã giao'];
    const idx = flow.indexOf(current);
    const next = idx >= 0 && idx < flow.length - 1 ? flow[idx + 1] : 'Đã giao';
    await osApi.updateFoodOrder(id, { status: next });
    await refreshData();
    showToast('Trạng thái giao đồ ăn', next);
  };

  return (
    <div className="h-full flex flex-col bg-[#F7F7FA] dark:bg-[#101015] text-zinc-900 dark:text-zinc-100">
      <div className="px-4 pt-3 pb-2 bg-white dark:bg-[#17171F] border-b border-zinc-200 dark:border-zinc-800 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UtensilsCrossed className="w-5 h-5 text-rose-500" />
            <h1 className="font-display font-bold text-base">Đặt đồ ăn</h1>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-500 font-semibold">
            Giao món mô phỏng
          </span>
        </div>

        <div className="grid grid-cols-2 gap-1.5 bg-zinc-100 dark:bg-zinc-900 p-1 rounded-xl text-xs font-semibold">
          <button
            onClick={() => setTab('browse')}
            className={`py-1.5 rounded-lg ${tab === 'browse' ? 'bg-white dark:bg-zinc-800 shadow-sm' : 'text-zinc-500'}`}
          >
            Quán ăn ({restaurants.length})
          </button>
          <button
            onClick={() => setTab('orders')}
            className={`py-1.5 rounded-lg ${tab === 'orders' ? 'bg-white dark:bg-zinc-800 shadow-sm' : 'text-zinc-500'}`}
          >
            Đơn của tôi ({orders.length})
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto os-scroll p-3 space-y-3">
        {tab === 'browse' && !selectedRest && (
          <div className="space-y-2.5">
            {restaurants.map((r) => (
              <div
                key={r.id}
                onClick={() => {
                  setSelectedRest(r);
                  setTray([]);
                }}
                className="rounded-2xl bg-white dark:bg-[#191922] border border-zinc-200 dark:border-zinc-800 overflow-hidden cursor-pointer"
              >
                <img src={r.image_url} alt="" className="w-full h-28 object-cover" />
                <div className="p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold">{r.name}</h3>
                    <span className="flex items-center gap-1 text-xs font-bold text-amber-500">
                      <Star className="w-3.5 h-3.5 fill-amber-400" /> {r.rating}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    {r.cuisine} · {r.price_tier} · {r.hours}
                  </p>
                  <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-1">
                    <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {r.address}</span>
                    <span className="flex items-center gap-1 text-rose-500 font-semibold"><Clock className="w-3 h-3" /> {r.eta_min} phút</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'browse' && selectedRest && (
          <div className="space-y-3">
            <button onClick={() => setSelectedRest(null)} className="text-xs font-semibold text-rose-500">
              ← Quay lại danh sách quán
            </button>
            <div className="p-3 rounded-2xl bg-white dark:bg-[#191922] border border-zinc-200 dark:border-zinc-800">
              <h2 className="text-sm font-bold">{selectedRest.name}</h2>
              <p className="text-[11px] text-zinc-500">{selectedRest.address}</p>
            </div>

            {menu.map((item) => (
              <div
                key={item.id}
                className="p-3 rounded-2xl bg-white dark:bg-[#191922] border border-zinc-200 dark:border-zinc-800 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-bold">{item.name}</h3>
                    <p className="text-[11px] text-zinc-500">{item.desc}</p>
                    <p className="text-xs font-bold text-rose-500 mt-1">{item.price.toLocaleString('vi-VN')}đ</p>
                  </div>
                  <button
                    onClick={() => setTray((prev) => [...prev, { name: item.name, price: item.price, topping: item.toppings[0] || '' }])}
                    className="px-3 py-1.5 rounded-xl bg-rose-500 text-white text-xs font-bold flex items-center gap-1 shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" /> Thêm
                  </button>
                </div>
                {item.toppings.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {item.toppings.map((tp) => (
                      <button
                        key={tp}
                        onClick={() => setTray((prev) => [...prev, { name: `${item.name} (${tp})`, price: item.price, topping: tp }])}
                        className="px-2 py-0.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[10px]"
                      >
                        + {tp}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {tray.length > 0 && (
              <div className="p-3 rounded-2xl bg-white dark:bg-[#191922] border border-rose-400/50 space-y-2 text-xs">
                <p className="font-bold">Khay món đang chọn ({tray.length} món)</p>
                <input
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none"
                />
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none"
                >
                  <option value="Ví mô phỏng PHONE BANK">Ví mô phỏng PHONE BANK</option>
                  <option value="Thẻ ngân hàng Hikari">Thẻ ngân hàng Hikari (Debit/Credit)</option>
                  <option value="Tiền mặt khi nhận (Mô phỏng)">Tiền mặt khi nhận (Mô phỏng)</option>
                </select>
                <div className="flex items-center justify-between font-bold pt-1">
                  <span>Tổng (+15k ship)</span>
                  <span className="text-rose-500">
                    {(tray.reduce((s, t) => s + t.price, 0) + 15000).toLocaleString('vi-VN')}đ
                  </span>
                </div>
                <button onClick={placeOrder} className="w-full py-2.5 rounded-xl bg-rose-500 text-white font-bold">
                  Xác nhận đặt đồ ăn (Mô phỏng)
                </button>
              </div>
            )}
          </div>
        )}

        {tab === 'orders' && (
          <div className="space-y-2.5">
            {orders.length === 0 ? (
              <p className="text-center py-12 text-xs text-zinc-500">Bạn chưa đặt đơn đồ ăn nào.</p>
            ) : (
              orders.map((ord) => (
                <div
                  key={ord.id}
                  className="p-3 rounded-2xl bg-white dark:bg-[#191922] border border-zinc-200 dark:border-zinc-800 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold">{ord.restaurant_name}</span>
                    <span className="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-500 text-[10px] font-bold">
                      {ord.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    Tài xế mô phỏng: {ord.driver_name} · {ord.driver_plate}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-rose-500">{ord.total.toLocaleString('vi-VN')}đ</span>
                    {ord.status !== 'Đã giao' ? (
                      <button
                        onClick={() => advanceFoodStatus(ord.id, ord.status)}
                        className="px-3 py-1 rounded-xl bg-rose-500 text-white text-[11px] font-semibold flex items-center gap-1"
                      >
                        <Bike className="w-3.5 h-3.5" /> Cập nhật giao
                      </button>
                    ) : (
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((st) => (
                          <button
                            key={st}
                            onClick={async () => {
                              await osApi.updateFoodOrder(ord.id, { rating: st });
                              await refreshData();
                            }}
                          >
                            <Star className={`w-4 h-4 ${st <= (ord.rating || 0) ? 'text-amber-400 fill-amber-400' : 'text-zinc-300'}`} />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
      <UniversalCardCheckoutModal
        open={cardCheckoutOpen}
        title={`Đặt món · ${selectedRest?.name || ''}`}
        merchant={selectedRest?.name || 'Đặt đồ ăn'}
        category="Ăn uống"
        amount={pendingTotal}
        channelType="online"
        appSource="Đặt đồ ăn"
        onClose={() => setCardCheckoutOpen(false)}
        onSuccess={async (res) => {
          await submitFoodOrder();
          showToast(
            'Thanh toán thẻ & đặt món thành công',
            `Tài xế đang chuẩn bị · Hoàn +${(res.cashbackEarned || 0).toLocaleString('vi-VN')}đ`,
            'success'
          );
        }}
      />
    </div>
  );
}
