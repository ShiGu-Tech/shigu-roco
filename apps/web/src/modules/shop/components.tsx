import React from 'react'
import { Heart } from 'lucide-react'

interface BikeProduct {
  id: string
  name: string
  brand: string
  price: number
  discount?: number
  image?: string
  isFavorite?: boolean
}

export const BikeCard: React.FC<{
  product: BikeProduct
  onFavorite?: (id: string) => void
  onClick?: (id: string) => void
}> = ({ product, onFavorite, onClick }) => {
  return (
    <div
      onClick={() => onClick?.(product.id)}
      className="shop-dark neomorph-raised rounded-3xl overflow-hidden cursor-pointer group"
      style={{
        background: 'var(--shop-card)',
        padding: '12px',
        aspectRatio: '1',
      }}
    >
      {/* 产品图片容器 */}
      <div className="relative w-full h-full rounded-2xl overflow-hidden shop-transition"
        style={{
          background: 'linear-gradient(135deg, #1a2a4a 0%, #2d5a8c 100%)',
        }}
      >
        <div className="w-full h-full flex items-center justify-center">
          <div className="text-center">
            {/* 模拟图片 */}
            <div className="text-6xl mb-4 group-hover:scale-110 shop-transition">🚲</div>
            {product.discount && (
              <div
                className="absolute top-3 left-3 rounded-lg font-bold text-white text-sm"
                style={{
                  background: 'var(--shop-primary)',
                  padding: '6px 12px',
                }}
              >
                {product.discount}% Off
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 产品信息 */}
      <div className="mt-3">
        <div className="flex justify-between items-start mb-2">
          <div>
            <p className="text-xs" style={{ color: 'var(--shop-text-muted)' }}>
              {product.brand}
            </p>
            <p className="font-semibold text-sm" style={{ color: 'var(--shop-text-primary)' }}>
              {product.name}
            </p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onFavorite?.(product.id)
            }}
            className="p-1.5 rounded-lg shop-transition"
            style={{
              background: product.isFavorite ? 'var(--shop-primary)' : 'var(--shop-card-hover)',
            }}
          >
            <Heart
              size={16}
              fill={product.isFavorite ? 'currentColor' : 'none'}
              color={product.isFavorite ? 'white' : 'var(--shop-text-muted)'}
            />
          </button>
        </div>

        {/* 价格 */}
        <p
          className="font-bold text-lg"
          style={{ color: 'var(--shop-primary-light)' }}
        >
          ${product.price.toFixed(2)}
        </p>
      </div>
    </div>
  )
}

export const NeomorphButton: React.FC<{
  children: React.ReactNode
  variant?: 'primary' | 'secondary'
  className?: string
  onClick?: () => void
}> = ({ children, variant = 'primary', className = '', onClick }) => {
  return (
    <button
      onClick={onClick}
      className={`neomorph-raised rounded-full font-semibold shop-transition ${className}`}
      style={{
        background: variant === 'primary' ? 'var(--shop-primary)' : 'var(--shop-card-hover)',
        color: variant === 'primary' ? 'white' : 'var(--shop-text-primary)',
        padding: '12px 28px',
        border: 'none',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

export const CategoryFilter: React.FC<{
  categories: string[]
  activeCategory: string
  onSelect: (category: string) => void
}> = ({ categories, activeCategory, onSelect }) => {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 shop-dark">
      {categories.map((cat) => (
        <button
          key={cat}
          onClick={() => onSelect(cat)}
          className="px-4 py-2 rounded-full font-medium text-sm neomorph-raised shop-transition flex-shrink-0"
          style={{
            background: activeCategory === cat ? 'var(--shop-primary)' : 'var(--shop-card)',
            color: activeCategory === cat ? 'white' : 'var(--shop-text-primary)',
          }}
        >
          {cat}
        </button>
      ))}
    </div>
  )
}

export const QuantityControl: React.FC<{
  value: number
  onChange: (value: number) => void
}> = ({ value, onChange }) => {
  return (
    <div
      className="flex items-center gap-2 rounded-lg neomorph-soft"
      style={{
        background: 'var(--shop-card)',
        padding: '8px',
        width: 'fit-content',
      }}
    >
      <button
        onClick={() => onChange(Math.max(1, value - 1))}
        className="p-1 rounded hover:opacity-80 shop-transition"
        style={{ color: 'var(--shop-primary)' }}
      >
        −
      </button>
      <span
        className="w-8 text-center font-semibold"
        style={{ color: 'var(--shop-text-primary)' }}
      >
        {value}
      </span>
      <button
        onClick={() => onChange(value + 1)}
        className="p-1 rounded hover:opacity-80 shop-transition"
        style={{ color: 'var(--shop-primary)' }}
      >
        +
      </button>
    </div>
  )
}

export const PriceTag: React.FC<{
  price: number
  discount?: number
}> = ({ price, discount }) => {
  const discountedPrice = discount ? price * (1 - discount / 100) : price
  return (
    <div className="flex items-baseline gap-2">
      <span
        className="text-3xl font-bold"
        style={{ color: 'var(--shop-primary-light)' }}
      >
        ${discountedPrice.toFixed(2)}
      </span>
      {discount && (
        <span
          className="text-sm line-through"
          style={{ color: 'var(--shop-text-muted)' }}
        >
          ${price.toFixed(2)}
        </span>
      )}
    </div>
  )
}
