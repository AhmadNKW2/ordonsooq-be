import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { IndexingService } from './search/indexing.service';

async function bootstrap() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const indexingService = app.get(IndexingService);

    const testProducts = [
        {
            id: '1',
            name_en: 'iPhone 15 Pro',
            name_ar: 'آيفون 15 برو',
            description_en: 'Latest Apple smartphone with titanium design',
            description_ar: 'أحدث هاتف ذكي من Apple بتصميم تيتانيوم',
            brand: 'Apple',
            category: 'Electronics',
            subcategory: 'Smartphones',
            tags: ['phone', 'mobile', 'هاتف'],
            price: 999,
            price_min: 999,
            price_max: 999,
            rating: 4.8,
            rating_count: 150,
            stock_quantity: 50,
            in_stock: true,
            is_available: true,
            images: ['https://example.com/iphone.jpg'],
            created_at: Date.now(),
            sales_count: 100,
            popularity_score: indexingService.calculatePopularityScore(100, 4.8, 150, new Date()),
        },
        {
            id: '2',
            name_en: 'Samsung Galaxy S24',
            name_ar: 'سامسونج جالاكسي S24',
            description_en: 'Flagship Android smartphone',
            description_ar: 'هاتف أندرويد رائد',
            brand: 'Samsung',
            category: 'Electronics',
            subcategory: 'Smartphones',
            tags: ['phone', 'android', 'هاتف'],
            price: 899,
            price_min: 899,
            price_max: 899,
            rating: 4.6,
            rating_count: 200,
            stock_quantity: 30,
            in_stock: true,
            is_available: true,
            images: ['https://example.com/samsung.jpg'],
            created_at: Date.now(),
            sales_count: 80,
            popularity_score: indexingService.calculatePopularityScore(80, 4.6, 200, new Date()),
        },
    ];

    await indexingService.bulkUpsertProducts(testProducts);
    console.log('✅ Test products indexed successfully');

    await app.close();
}

bootstrap();