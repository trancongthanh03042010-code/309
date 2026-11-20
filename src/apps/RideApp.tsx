import React, { useState } from 'react';
import { Bike, Car, CheckCircle2, CreditCard, MapPin, Navigation, Star } from 'lucide-react';
import { useOS } from '../context/OSContext';
import { osApi } from '../services/api';
import { UniversalCardCheckoutModal } from '../components/banking/cards/UniversalCardCheckoutModal';

const VEHICLES = [
  { id: 'bike', name: 'Xe máy (OS Bike)', base: 18000, eta: 3, icon: Bike },
  { id: 'car4', name: 'Ô tô 4 chỗ', base: 45000, eta: 5, icon: Car },
  { id: 'car7', name: 'Ô tô 7 chỗ', base: 68000, eta: 7, icon: Car },
];

export function RideApp() {
  const { data, refreshData, showToast } = useOS();
  const [pickup, setPickup] = useState('Nhà hát Thành phố, Quận 1 (Mô phỏng)');
  const [dropoff, setDropoff] = useState('Phố đi bộ Shibuya Studio (Mô phỏng)');
  const [vehicle, setVehicle] = useState('bike');
  const [payMethod, setPayMethod] = useState<'wallet' | 'card'>('wallet');
  const [cardCheckoutOpen, setCardCheckoutOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const trips = data?.rideTrips || [];
  const selectedV = VEHICLES.find((v) => v.id === vehicle) || VEHICLES[0];
  const distanceFactor = Math.max(1, Math.min(4, Math.abs(dropoff.length - pickup.length) / 8 + 1.2));
  const estFare = Math.round((selectedV.base * distanceFactor) / 1000) * 1000;

  const submitRide = async () => {
    await osApi.createRide({
      pickup: pickup.trim(),
      dropoff: dropoff.trim(),
      vehicle_type: selectedV.name,
      fare: estFare,
    });
    await refreshData();
  };

  const bookRide = async () => {
    if (!pickup.trim() || !dropoff.trim()) return;
    if (payMethod === 'card') {
      setCardCheckoutOpen(true);
      return;
    }
    setBusy(true);
    try {
      await submitRide();
      showToast('Đã đặt chuyến mô phỏng', `Tài xế đang tới điểm đón trong ~${selectedV.eta} phút`, 'success');
    } catch (err) {
      showToast('Đặt xe lỗi', err instanceof Error ? err.message : 'Thử lại sau', 'error');
    } finally {
      setBusy(false);
    }
  };

  const advanceTrip = async (id: string, status: string) => {
    const flow = ['Tài xế đang đến', 'Đang di chuyển', 'Hoàn thành'];
    const idx = flow.indexOf(status);
    const next = idx >= 0 && idx < flow.length - 1 ? flow[idx + 1] : 'Hoàn thành';
    await osApi.updateRide(id, { status: next, eta_min: next === 'Hoàn thành' ? 0 : 1 });
    await refreshData();
    showToast('Cập nhật chuyến đi', next);
  };

  return (
    <div className="h-full flex flex-col bg-[#F7F7FA] dark:bg-[#101015] text-zinc-900 dark:text-zinc-100">
      <div className="px-4 pt-3 pb-2.5 bg-white dark:bg-[#17171F] border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Car className="w-5 h-5 text-emerald-500" />
          <h1 className="font-display font-bold text-base">Đặt xe & Di chuyển</h1>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 font-semibold">
          Tài xế mô phỏng
        </span>
      </div>

      <div className="flex-1 overflow-y-auto os-scroll p-3 space-y-3">
        {/* Route Card */}
        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#191922] border border-zinc-200 dark:border-zinc-800 space-y-2.5 text-xs">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900">
            <MapPin className="w-4 h-4 text-sky-500 shrink-0" />
            <input
              value={pickup}
              onChange={(e) => setPickup(e.target.value)}
              placeholder="Điểm đón..."
              className="flex-1 bg-transparent outline-none"
            />
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900">
            <Navigation className="w-4 h-4 text-rose-500 shrink-0" />
            <input
              value={dropoff}
              onChange={(e) => setDropoff(e.target.value)}
              placeholder="Điểm đến..."
              className="flex-1 bg-transparent outline-none"
            />
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1">
            {VEHICLES.map((v) => {
              const Icon = v.icon;
              const active = vehicle === v.id;
              return (
                <button
                  key={v.id}
                  onClick={() => setVehicle(v.id)}
                  className={`p-2 rounded-xl border text-left transition-all ${
                    active ? 'border-emerald-500 bg-emerald-500/10' : 'border-zinc-200 dark:border-zinc-800'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${active ? 'text-emerald-500' : 'text-zinc-500'}`} />
                  <p className="text-[11px] font-bold mt-1 truncate">{v.name}</p>
                  <p className="text-[10px] text-zinc-500">{v.eta} phút</p>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-1.5 pt-0.5">
            <button
              type="button"
              onClick={() => setPayMethod('wallet')}
              className={`py-1.5 px-2 rounded-xl border text-[11px] font-bold ${
                payMethod === 'wallet'
                  ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'border-zinc-200 dark:border-zinc-800 text-zinc-500'
              }`}
            >
              Ví mô phỏng
            </button>
            <button
              type="button"
              onClick={() => setPayMethod('card')}
              className={`py-1.5 px-2 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1 ${
                payMethod === 'card'
                  ? 'border-rose-500 bg-rose-500/10 text-rose-600 dark:text-rose-400'
                  : 'border-zinc-200 dark:border-zinc-800 text-zinc-500'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Thẻ ngân hàng Hikari</span>
            </button>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div>
              <p className="text-[10px] text-zinc-500">Giá cước ước tính</p>
              <p className="text-base font-bold text-emerald-600 font-mono-num">{estFare.toLocaleString('vi-VN')}đ</p>
            </div>
            <button
              onClick={bookRide}
              disabled={busy}
              className={`px-4 py-2.5 rounded-xl text-white font-bold ${
                payMethod === 'card' ? 'bg-rose-600' : 'bg-emerald-600'
              }`}
            >
              {payMethod === 'card' ? 'Thanh toán thẻ & Đặt xe' : 'Đặt xe ngay'}
            </button>
          </div>
        </div>

        {/* Trip History / Active */}
        <div className="space-y-2">
          <h2 className="text-xs font-bold uppercase text-zinc-500">Chuyến xe ({trips.length})</h2>
          {trips.length === 0 ? (
            <p className="text-center py-8 text-xs text-zinc-500">Chưa có chuyến đi mô phỏng nào.</p>
          ) : (
            trips.map((tr) => (
              <div
                key={tr.id}
                className="p-3 rounded-2xl bg-white dark:bg-[#191922] border border-zinc-200 dark:border-zinc-800 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold">{tr.vehicle_type}</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 text-[10px] font-bold">
                    {tr.status}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500">Từ: {tr.pickup}</p>
                <p className="text-[11px] text-zinc-500">Đến: {tr.dropoff}</p>
                <p className="text-[11px] font-medium">
                  {tr.driver_name} · <span className="font-mono-num">{tr.vehicle_plate}</span>
                </p>
                <div className="flex items-center justify-between pt-1">
                  <span className="font-bold text-emerald-600">{tr.fare.toLocaleString('vi-VN')}đ</span>
                  {tr.status !== 'Hoàn thành' ? (
                    <button
                      onClick={() => advanceTrip(tr.id, tr.status)}
                      className="px-3 py-1 rounded-xl bg-emerald-600 text-white text-[11px] font-semibold"
                    >
                      Chuyển bước tiếp theo
                    </button>
                  ) : (
                    <div className="flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mr-1" />
                      {[1, 2, 3, 4, 5].map((st) => (
                        <button
                          key={st}
                          onClick={async () => {
                            await osApi.updateRide(tr.id, { rating: st });
                            await refreshData();
                          }}
                        >
                          <Star className={`w-4 h-4 ${st <= (tr.rating || 0) ? 'text-amber-400 fill-amber-400' : 'text-zinc-300'}`} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      <UniversalCardCheckoutModal
        open={cardCheckoutOpen}
        title={`Đặt chuyến ${selectedV.name}`}
        merchant={`OS Ride · ${selectedV.name}`}
        category="Đi lại"
        amount={estFare}
        channelType="online"
        appSource="Đặt xe"
        onClose={() => setCardCheckoutOpen(false)}
        onSuccess={async (res) => {
          await submitRide();
          showToast(
            'Đã thanh toán thẻ & đặt chuyến',
            `Tài xế đang đến (~${selectedV.eta} phút) · Hoàn +${(res.cashbackEarned || 0).toLocaleString('vi-VN')}đ`,
            'success'
          );
        }}
      />
    </div>
  );
}
