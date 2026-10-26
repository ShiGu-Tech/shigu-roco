import React, { useState } from 'react'
import { Heart, Search, ChevronLeft } from 'lucide-react'
import { BikeCard, NeomorphButton, CategoryFilter, PriceTag } from './components'
import './shop-theme.css'

interface BikeProduct {
  id: string
  name: string
  brand: string
  price: number
  discount?: number
  image?: string
  isFavorite?: boolean
}

const MOCK_PRODUCTS: BikeProduct[] = [
  { id: '1', name: 'PEUGEOT - LR01', brand: 'Road Bike', price: 1999.99, discount: 0 },
  { id: '2', name: 'PILOT - CHROMOLY 520', brand: 'Mountain Bike', price: 3999.99, discount: 0 },
  { id: '3', name: 'SMITH - Trade', brand: 'Helmet', price: 120 },
]

type PageView = 'home' | 'detail' | 'cart'

export const ShopView: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<PageView>('home')
  const [activeCategory, setActiveCategory] = useState('All')
  const [products] = useState(MOCK_PRODUCTS)
  const [selectedProduct, setSelectedProduct] = useState<BikeProduct | null>(null)
  const [cartItems, setCartItems] = useState<Map<string, number>>(new Map())
  const [favorites, setFavorites] = useState<Set<string>>(new Set())

  const handleFavorite = (id: string) => {
    const newFavorites = new Set(favorites)
    if (newFavorites.has(id)) {
      newFavorites.delete(id)
    } else {
      newFavorites.add(id)
    }
    setFavorites(newFavorites)
  }

  const handleProductClick = (id: string) => {
    const product = products.find((p) => p.id === id)
    if (product) {
      setSelectedProduct(product)
      setCurrentPage('detail')
    }
  }

  const handleAddToCart = (productId: string) => {
    const newCart = new Map(cartItems)
    newCart.set(productId, (newCart.get(productId) || 0) + 1)
    setCartItems(newCart)
  }

  // 首页
  if (currentPage === 'home') {
    return (
      <div className="shop-dark min-h-screen" style={{ background: 'var(--shop-bg)' }}>
        {/* 导航栏 */}
        <div
          className="flex justify-between items-center p-4 safe-area-inset-top"
          style={{ paddingTop: '16px' }}
        >
          <div>
            <h1
              className="text-hero font-bold text-white"
              style={{ color: 'var(--shop-text-primary)' }}
            >
              Choose Your Bike
            </h1>
          </div>
          <button
            className="p-2.5 rounded-full"
            style={{
              background: 'var(--shop-primary)',
              color: 'white',
            }}
          >
            <Search size={20} />
          </button>
        </div>

        {/* 促销横幅 */}
        <div
          className="mx-4 mt-4 rounded-3xl p-6 relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #1a2a4a 0%, #2d5a8c 100%)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <div className="absolute inset-0" style={{
            background: 'linear-gradient(135deg, transparent 0%, var(--shop-primary) 100%)',
            opacity: 0.3,
          }} />
          <div className="relative z-10">
            <p
              className="text-sm font-medium mb-2"
              style={{ color: 'var(--shop-text-secondary)' }}
            >
              Limited Time Offer
            </p>
            <div className="flex items-center justify-between">
              <h2 className="text-title font-bold text-white">30% Off</h2>
              <div className="text-5xl">🚲</div>
            </div>
          </div>
        </div>

        {/* 分类过滤 */}
        <div className="mt-6 px-4">
          <CategoryFilter
            categories={['All', 'Road Bike', 'Mountain', 'Accessories']}
            activeCategory={activeCategory}
            onSelect={setActiveCategory}
          />
        </div>

        {/* 产品网格 */}
        <div className="px-4 mt-6 pb-24">
          <div className="grid grid-cols-2 gap-4">
            {products.map((product) => (
              <BikeCard
                key={product.id}
                product={{
                  ...product,
                  isFavorite: favorites.has(product.id),
                }}
                onFavorite={handleFavorite}
                onClick={handleProductClick}
              />
            ))}
          </div>
        </div>

        {/* 底部导航 */}
        <div
          className="fixed bottom-0 left-0 right-0 flex justify-around items-center py-3 safe-area-inset-bottom"
          style={{
            background: 'var(--shop-card)',
            borderTop: '1px solid var(--shop-border)',
          }}
        >
          <button
            className="p-2 rounded-full"
            style={{
              background: 'var(--shop-primary)',
              color: 'white',
            }}
          >
            🚲
          </button>
          <button style={{ color: 'var(--shop-text-secondary)' }}>📊</button>
          <button
            onClick={() => setCurrentPage('cart')}
            style={{ color: 'var(--shop-text-secondary)' }}
          >
            🛒 {cartItems.size > 0 && `(${cartItems.size})`}
          </button>
          <button style={{ color: 'var(--shop-text-secondary)' }}>👤</button>
          <button style={{ color: 'var(--shop-text-secondary)' }}>📋</button>
        </div>
      </div>
    )
  }

  // 产品详情页
  if (currentPage === 'detail' && selectedProduct) {
    return (
      <div className="shop-dark min-h-screen" style={{ background: 'var(--shop-bg)' }}>
        {/* 顶部导航 */}
        <div className="flex justify-between items-center p-4 safe-area-inset-top">
          <button
            onClick={() => setCurrentPage('home')}
            className="p-2.5 rounded-full"
            style={{
              background: 'var(--shop-primary)',
              color: 'white',
            }}
          >
            <ChevronLeft size={20} />
          </button>
          <h1 className="text-title font-bold flex-1 text-center mx-4" style={{ color: 'var(--shop-text-primary)' }}>
            {selectedProduct.name}
          </h1>
          <div className="w-10" />
        </div>

        {/* 产品图片 + 渐变分割 */}
        <div className="relative mt-6">
          <div
            className="mx-4 rounded-3xl h-96 flex items-center justify-center relative overflow-hidden gradient-divider"
            style={{
              background: 'linear-gradient(135deg, #1a2a4a 0%, #3b82f6 100%)',
            }}
          >
            <div className="text-center z-10">
              <div className="text-9xl mb-4">🚲</div>
            </div>
          </div>

          {/* 标签栏 */}
          <div className="flex gap-3 px-4 mt-6">
            <button
              className="px-6 py-2 rounded-full font-medium text-sm shop-transition"
              style={{
                background: 'var(--shop-primary)',
                color: 'white',
              }}
            >
              Description
            </button>
            <button
              className="px-6 py-2 rounded-full font-medium text-sm shop-transition"
              style={{
                background: 'var(--shop-card)',
                color: 'var(--shop-text-secondary)',
              }}
            >
              Specification
            </button>
          </div>
        </div>

        {/* 产品信息 */}
        <div className="px-4 mt-6">
          <h2
            className="text-2xl font-bold mb-2"
            style={{ color: 'var(--shop-text-primary)' }}
          >
            {selectedProduct.brand}
          </h2>
          <p
            className="text-sm mb-6 leading-relaxed"
            style={{ color: 'var(--shop-text-secondary)' }}
          >
            The LR01 uses the same design as the most iconic bikes from PEUGEOT Cycles&apos; 130-year
            history and combines it with agile, dynamic performance. As well as a lugged steel
            frame and iconic PEUGEOT black-and-white chequer design, this city bike also features a
            16-speed Shimano Claris drivetrain.
          </p>

          {/* 价格 */}
          <PriceTag price={selectedProduct.price} discount={selectedProduct.discount} />

          {/* 操作按钮 */}
          <div className="flex gap-3 mt-8 mb-8">
            <button
              onClick={() => handleFavorite(selectedProduct.id)}
              className="p-3 rounded-full neomorph-raised"
              style={{
                background: favorites.has(selectedProduct.id)
                  ? 'var(--shop-primary)'
                  : 'var(--shop-card)',
              }}
            >
              <Heart
                size={24}
                fill={favorites.has(selectedProduct.id) ? 'currentColor' : 'none'}
                color={favorites.has(selectedProduct.id) ? 'white' : 'var(--shop-text-secondary)'}
              />
            </button>
            <button
              onClick={() => {
                handleAddToCart(selectedProduct.id)
              }}
              className="flex-1 py-3 rounded-full bg-blue-500 font-semibold text-white neomorph-raised shop-transition"
              style={{
                background: 'var(--shop-primary)',
              }}
            >
              Add to Cart
            </button>
          </div>
        </div>
      </div>
    )
  }

  // 购物车页
  if (currentPage === 'cart') {
    const cartProducts = Array.from(cartItems.entries()).map(([id, qty]) => {
      const product = products.find((p) => p.id === id)
      return { ...product!, quantity: qty }
    })

    const total = cartProducts.reduce((sum, item) => sum + item.price * item.quantity, 0)

    return (
      <div className="shop-dark min-h-screen" style={{ background: 'var(--shop-bg)' }}>
        {/* 顶部导航 */}
        <div className="flex justify-between items-center p-4 safe-area-inset-top">
          <button
            onClick={() => setCurrentPage('home')}
            className="p-2.5 rounded-full"
            style={{
              background: 'var(--shop-primary)',
              color: 'white',
            }}
          >
            <ChevronLeft size={20} />
          </button>
          <h1 className="text-title font-bold" style={{ color: 'var(--shop-text-primary)' }}>
            My Shopping Cart
          </h1>
          <div className="w-10" />
        </div>

        {/* 购物车项目 */}
        <div className="px-4 mt-6">
          {cartProducts.map((item) => (
            <div
              key={item.id}
              className="flex gap-4 p-4 rounded-2xl mb-3 shop-transition"
              style={{
                background: 'var(--shop-card)',
                border: '1px solid var(--shop-border)',
              }}
            >
              <div
                className="w-20 h-20 rounded-xl flex items-center justify-center text-4xl"
                style={{
                  background: 'linear-gradient(135deg, #1a2a4a 0%, #2d5a8c 100%)',
                }}
              >
                🚲
              </div>
              <div className="flex-1">
                <h3
                  className="font-bold text-sm mb-1"
                  style={{ color: 'var(--shop-text-primary)' }}
                >
                  {item.brand}
                </h3>
                <p
                  className="text-lg font-bold mb-2"
                  style={{ color: 'var(--shop-primary-light)' }}
                >
                  ${(item.price * item.quantity).toFixed(2)}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const newCart = new Map(cartItems)
                      newCart.set(item.id, Math.max(1, item.quantity - 1))
                      setCartItems(newCart)
                    }}
                    className="px-3 py-1 rounded text-sm"
                    style={{
                      background: 'var(--shop-card-hover)',
                      color: 'var(--shop-primary)',
                    }}
                  >
                    −
                  </button>
                  <span style={{ color: 'var(--shop-text-secondary)' }}>{item.quantity}</span>
                  <button
                    onClick={() => {
                      const newCart = new Map(cartItems)
                      newCart.set(item.id, item.quantity + 1)
                      setCartItems(newCart)
                    }}
                    className="px-3 py-1 rounded text-sm"
                    style={{
                      background: 'var(--shop-card-hover)',
                      color: 'var(--shop-primary)',
                    }}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 优惠码输入 */}
        <div className="px-4 mt-8">
          <input
            type="text"
            placeholder="Enter promo code"
            className="w-full px-4 py-3 rounded-xl neomorph-soft"
            style={{
              background: 'var(--shop-card)',
              color: 'var(--shop-text-primary)',
              border: '1px solid var(--shop-border)',
            }}
          />
          <NeomorphButton className="w-full mt-3">Apply</NeomorphButton>
        </div>

        {/* 总计 */}
        <div className="px-4 mt-8 mb-32">
          <div
            className="flex justify-between items-center text-lg mb-4"
            style={{ color: 'var(--shop-text-secondary)' }}
          >
            <span>Subtotal</span>
            <span>${total.toFixed(2)}</span>
          </div>
          <NeomorphButton className="w-full text-lg py-4 flex items-center justify-center gap-2">
            <span>Checkout</span>
            <span>→</span>
          </NeomorphButton>
        </div>
      </div>
    )
  }

  return null
}
