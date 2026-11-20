import React, { useState } from 'react';
import {
  CheckCircle2,
  CreditCard,
  Minus,
  Package,
  Plus,
  Search,
  ShoppingBag,
  ShoppingCart,
  Star,
  Tag,
  Trash2,
  Truck,
} from 'lucide-react';
import { useOS } from '../context/OSContext';
import { osApi } from '../services/api';
import type { ShoppingProduct } from '../types/os';
import { UniversalCardCheckoutModal } from '../components/banking/cards/UniversalCardCheckoutModal';

export function ShoppingApp() {
  const { data, refreshData, showToast } = useOS();
  const [tab, setTab] = useState<'shop' | 'cart' | 'orders'>('shop');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Tất cả');
  const [selectedProduct, setSelectedProduct] = useState<ShoppingProduct | null>(null);
  const [pickedVariant, setPickedVariant] = useState('');
  const [coupon, setCoupon] = useState('');
  const [address, setAddress] = useState('42 Nguyễn Huệ, Quận 1, TP.HCM (Địa chỉ Demo)');
  const [payMethod, setPayMethod] = useState<'wallet' | 'card'>('wallet');
  const [cardCheckoutOpen, setCardCheckoutOpen] = useState(false);

  const products = data?.shoppingProducts || [];
  const cart = data?.shoppingCart || [];
  const orders = data?.shoppingOrders || [];

  const categories = ['Tất cả', ...Array.from(new Set(products.map((p) => p.category)))];
  const filtered = products.filter((p) => {
    const mCat = category === 'Tất cả' || p.category === category;
    const mQ = !search.trim() || p.name.toLowerCase().includes(search.toLowerCase());
    return mCat && mQ;
  });

  const cartDetails = cart
    .map((ci) => {
      const product = products.find((p) => p.id === ci.product_id);
      return product ? { ...ci, product } : null;
    })
    .filter(Boolean) as Array<{ id: string; product_id: string; quantity: number; selected_variant: string; product: ShoppingProduct }>;

  const subtotal = cartDetails.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const discount = coupon.trim().toUpperCase() === 'PHONEOS10' ? Math.round(subtotal * 0.1) : 0;
  const shippingFee = subtotal > 0 ? 25000 : 0;
  const finalTotal = Math.max(0, subtotal - discount + shippingFee);

  const openProduct = (prod: ShoppingProduct) => {
    const parsed = JSON.parse(prod.variants_json || '{}') as { colors?: string[]; sizes?: string[] };
    setPickedVariant(parsed.colors?.[0] || 'Mặc định');
    setSelectedProduct(prod);
  };

  const handleAddToCart = async (prod: ShoppingProduct, variant: string) => {
    await osApi.addToCart({ product_id: prod.id, quantity: 1, selected_variant: variant });
    await refreshData();
    showToast('Giỏ hàng', `Đã thêm ${prod.name} vào giỏ (Mô phỏng)`);
    setSelectedProduct(null);
  };

  const completeOrder = async () => {
    await osApi.checkoutShopping({
      items: cartDetails.map((c) => ({ name: c.product.name, qty: c.quantity, price: c.product.price, variant: c.selected_variant })),
      subtotal,
      discount,
      shipping_fee: shippingFee,
      coupon_code: coupon.trim().toUpperCase(),
      address,
    });
    await refreshData();
    setCoupon('');
    setTab('orders');
  };

  const handleCheckout = async () => {
    if (cartDetails.length === 0) return;
    if (payMethod === 'card') {
      setCardCheckoutOpen(true);
      return;
    }
    await completeOrder();
    showToast('Đặt hàng mô phỏng thành công', 'Đơn hàng đang chờ xác nhận.', 'success');
  };

  const advanceOrder = async (orderId: string, currentStatus: string) => {
    const flow = ['Chờ xác nhận', 'Đang đóng gói', 'Đang giao', 'Hoàn thành'];
    const idx = flow.indexOf(currentStatus);
    const next = idx >= 0 && idx < flow.length - 1 ? flow[idx + 1] : 'Hoàn thành';
    await osApi.updateShoppingOrder(orderId, next);
    await refreshData();
    showToast('Cập nhật đơn hàng', `Trạng thái mới: ${next}`);
  };

  return (
    <div className="h-full flex flex-col bg-[#F7F7FA] dark:bg-[#101015] text-zinc-900 dark:text-zinc-100">
      <div className="px-4 pt-3 pb-2 bg-white dark:bg-[#17171F] border-b border-zinc-200 dark:border-zinc-800 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-orange-500" />
            <h1 className="font-display font-bold text-base">Anime Mart</h1>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-300 font-semibold">
            Thương mại điện tử mô phỏng
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1.5 bg-zinc-100 dark:bg-zinc-900 p-1 rounded-xl text-xs font-semibold">
          <button
            onClick={() => setTab('shop')}
            className={`py-1.5 rounded-lg ${tab === 'shop' ? 'bg-white dark:bg-zinc-800 shadow-sm' : 'text-zinc-500'}`}
          >
            Sản phẩm
          </button>
          <button
            onClick={() => setTab('cart')}
            className={`py-1.5 rounded-lg flex items-center justify-center gap-1 ${tab === 'cart' ? 'bg-white dark:bg-zinc-800 shadow-sm' : 'text-zinc-500'}`}
          >
            <ShoppingCart className="w-3.5 h-3.5" /> Giỏ ({cart.reduce((s, i) => s + i.quantity, 0)})
          </button>
          <button
            onClick={() => setTab('orders')}
            className={`py-1.5 rounded-lg flex items-center justify-center gap-1 ${tab === 'orders' ? 'bg-white dark:bg-zinc-800 shadow-sm' : 'text-zinc-500'}`}
          >
            <Package className="w-3.5 h-3.5" /> Đơn ({orders.length})
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto os-scroll p-3 space-y-3">
        {tab === 'shop' && (
          <>
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-[#191922] border border-zinc-200 dark:border-zinc-800">
              <Search className="w-4 h-4 text-zinc-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm tai nghe, máy ảnh, áo hoodie..."
                className="flex-1 bg-transparent text-xs outline-none"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto os-scroll-hidden">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`px-3 py-1 rounded-full text-[11px] font-semibold shrink-0 ${
                    category === c ? 'bg-orange-500 text-white' : 'bg-white dark:bg-zinc-800'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {filtered.map((prod) => (
                <div
                  key={prod.id}
                  onClick={() => openProduct(prod)}
                  className="rounded-2xl bg-white dark:bg-[#191922] border border-zinc-200/80 dark:border-zinc-800 overflow-hidden cursor-pointer flex flex-col"
                >
                  <img src={prod.image_url} alt="" className="w-full h-28 object-cover" />
                  <div className="p-2.5 flex-1 flex flex-col justify-between">
                    <div>
                      <p className="text-[10px] text-orange-500 font-semibold">{prod.category}</p>
                      <h3 className="text-xs font-bold line-clamp-2 mt-0.5">{prod.name}</h3>
                    </div>
                    <div className="mt-2">
                      <div className="flex items-center gap-1 text-[10px] text-amber-500">
                        <Star className="w-3 h-3 fill-amber-400" /> {prod.rating} · Kho {prod.stock}
                      </div>
                      <p className="text-xs font-bold text-rose-500 mt-0.5">
                        {prod.price.toLocaleString('vi-VN')}đ
                      </p>
                      <p className="text-[10px] text-zinc-400 line-through">
                        {prod.original_price.toLocaleString('vi-VN')}đ
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'cart' && (
          <div className="space-y-3">
            {cartDetails.length === 0 ? (
              <div className="text-center py-12 text-xs text-zinc-500">
                Giỏ hàng trống. Hãy chọn sản phẩm ở tab Sản phẩm!
              </div>
            ) : (
              <>
                {cartDetails.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-2xl bg-white dark:bg-[#191922] border border-zinc-200 dark:border-zinc-800 flex items-center gap-3"
                  >
                    <img src={item.product.image_url} alt="" className="w-14 h-14 rounded-xl object-cover shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold truncate">{item.product.name}</p>
                      <p className="text-[10px] text-zinc-500">Phân loại: {item.selected_variant || 'Mặc định'}</p>
                      <p className="text-xs font-bold text-rose-500 mt-0.5">
                        {(item.product.price * item.quantity).toLocaleString('vi-VN')}đ
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={async () => {
                          if (item.quantity <= 1) await osApi.removeCartItem(item.id);
                          else await osApi.updateCartItem(item.id, item.quantity - 1);
                          await refreshData();
                        }}
                        className="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-xs font-bold w-5 text-center">{item.quantity}</span>
                      <button
                        onClick={async () => {
                          await osApi.updateCartItem(item.id, item.quantity + 1);
                          await refreshData();
                        }}
                        className="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={async () => {
                          await osApi.removeCartItem(item.id);
                          await refreshData();
                        }}
                        className="p-1.5 text-rose-500"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}

                <div className="p-3 rounded-2xl bg-white dark:bg-[#191922] border border-zinc-200 dark:border-zinc-800 space-y-2.5 text-xs">
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-orange-500 shrink-0" />
                    <input
                      value={coupon}
                      onChange={(e) => setCoupon(e.target.value)}
                      placeholder="Nhập mã giảm giá (gợi ý: PHONEOS10)"
                      className="flex-1 px-2.5 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none"
                    />
                  </div>
                  <input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Địa chỉ nhận hàng mô phỏng"
                    className="w-full px-2.5 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none"
                  />
                  <div className="space-y-1">
                    <p className="text-[11px] font-bold text-zinc-500">Phương thức thanh toán</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPayMethod('wallet')}
                        className={`py-2 px-2 rounded-xl border text-[11px] font-bold ${
                          payMethod === 'wallet'
                            ? 'border-orange-500 bg-orange-500/10 text-orange-600 dark:text-orange-400'
                            : 'border-zinc-200 dark:border-zinc-800 text-zinc-500'
                        }`}
                      >
                        Ví mô phỏng
                      </button>
                      <button
                        type="button"
                        onClick={() => setPayMethod('card')}
                        className={`py-2 px-2 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1 ${
                          payMethod === 'card'
                            ? 'border-rose-500 bg-rose-500/10 text-rose-600 dark:text-rose-400'
                            : 'border-zinc-200 dark:border-zinc-800 text-zinc-500'
                        }`}
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        <span>Thẻ ngân hàng</span>
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1 pt-1 border-t border-zinc-200 dark:border-zinc-800">
                    <div className="flex justify-between"><span>Tạm tính</span><span>{subtotal.toLocaleString('vi-VN')}đ</span></div>
                    <div className="flex justify-between text-emerald-500"><span>Giảm giá</span><span>-{discount.toLocaleString('vi-VN')}đ</span></div>
                    <div className="flex justify-between"><span>Phí vận chuyển</span><span>{shippingFee.toLocaleString('vi-VN')}đ</span></div>
                    <div className="flex justify-between font-bold text-sm pt-1"><span>Tổng thanh toán</span><span className="text-rose-500">{finalTotal.toLocaleString('vi-VN')}đ</span></div>
                  </div>
                  <button
                    onClick={handleCheckout}
                    className={`w-full py-2.5 rounded-xl text-white font-bold ${
                      payMethod === 'card' ? 'bg-rose-600' : 'bg-orange-500'
                    }`}
                  >
                    {payMethod === 'card' ? 'Thanh toán bằng Thẻ ngân hàng' : 'Đặt hàng mô phỏng'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'orders' && (
          <div className="space-y-2.5">
            {orders.length === 0 ? (
              <p className="text-center py-12 text-xs text-zinc-500">Chưa có đơn hàng mô phỏng nào.</p>
            ) : (
              orders.map((ord) => {
                const items = JSON.parse(ord.items_json || '[]') as Array<{ name: string; qty: number }>;
                return (
                  <div
                    key={ord.id}
                    className="p-3 rounded-2xl bg-white dark:bg-[#191922] border border-zinc-200 dark:border-zinc-800 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold">Đơn #{ord.id.slice(-6)}</span>
                      <span className="px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-600 dark:text-violet-300 text-[10px] font-bold">
                        {ord.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500">
                      {items.map((i) => `${i.name} x${i.qty}`).join(', ')}
                    </p>
                    <div className="flex items-center justify-between pt-1">
                      <span className="font-bold text-rose-500">{ord.total.toLocaleString('vi-VN')}đ</span>
                      {ord.status !== 'Hoàn thành' ? (
                        <button
                          onClick={() => advanceOrder(ord.id, ord.status)}
                          className="px-3 py-1 rounded-xl bg-orange-500 text-white text-[11px] font-semibold flex items-center gap-1"
                        >
                          <Truck className="w-3.5 h-3.5" /> Cập nhật giao hàng
                        </button>
                      ) : (
                        <span className="text-emerald-500 flex items-center gap-1 text-[11px] font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Đã giao xong
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Product Detail Modal */}
      {selectedProduct && (
        <div
          onClick={() => setSelectedProduct(null)}
          className="absolute inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-end p-3"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded-3xl bg-white dark:bg-[#1A1A22] p-4 space-y-3 border border-zinc-200 dark:border-zinc-800"
          >
            <img src={selectedProduct.image_url} alt="" className="w-full h-36 rounded-2xl object-cover" />
            <div>
              <h3 className="text-sm font-bold">{selectedProduct.name}</h3>
              <p className="text-xs text-zinc-500 mt-1">{selectedProduct.description}</p>
              <p className="text-base font-bold text-rose-500 mt-1.5">
                {selectedProduct.price.toLocaleString('vi-VN')}đ
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-zinc-500 mb-1.5">Chọn phân loại</p>
              <div className="flex flex-wrap gap-1.5">
                {(JSON.parse(selectedProduct.variants_json || '{}') as { colors?: string[] }).colors?.map((col) => (
                  <button
                    key={col}
                    onClick={() => setPickedVariant(col)}
                    className={`px-3 py-1 rounded-xl text-xs font-medium ${
                      pickedVariant === col ? 'bg-orange-500 text-white' : 'bg-zinc-100 dark:bg-zinc-800'
                    }`}
                  >
                    {col}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={() => handleAddToCart(selectedProduct, pickedVariant)}
              className="w-full py-2.5 rounded-xl bg-orange-500 text-white text-xs font-bold"
            >
              Thêm vào giỏ hàng (Mô phỏng)
            </button>
          </div>
        </div>
      )}
      <UniversalCardCheckoutModal
        open={cardCheckoutOpen}
        title="Thanh toán giỏ hàng Anime Mart"
        merchant="Anime Mart"
        category="Mua sắm"
        amount={finalTotal}
        channelType="online"
        appSource="Anime Mart"
        onClose={() => setCardCheckoutOpen(false)}
        onSuccess={async (res) => {
          await completeOrder();
          showToast(
            'Thanh toán thẻ thành công',
            `Đơn hàng đã thanh toán · Hoàn +${(res.cashbackEarned || 0).toLocaleString('vi-VN')}đ`,
            'success'
          );
        }}
      />
    </div>
  );
}
