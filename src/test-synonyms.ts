import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { TypesenseService } from './search/typesense.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const typesenseService = app.get(TypesenseService);
  const client = typesenseService.getClient();
  const collectionName = typesenseService.getCollectionName();

  const synonyms = [
    {
      id: 'synonym-phone',
      synonyms: ['phone', 'mobile', 'smartphone', 'هاتف', 'موبايل'],
    },
    {
      id: 'synonym-laptop',
      synonyms: ['laptop', 'notebook', 'computer', 'كمبيوتر', 'لابتوب'],
    },
    {
      id: 'synonym-tv',
      synonyms: ['tv', 'television', 'screen', 'تلفزيون', 'شاشة'],
    },
    {
      id: 'synonym-headphones',
      synonyms: ['headphones', 'earphones', 'earbuds', 'سماعات'],
    },
    {
      id: 'synonym-shoes',
      synonyms: ['shoes', 'sneakers', 'trainers', 'footwear', 'حذاء', 'أحذية'],
    },
  ];

  for (const synonym of synonyms) {
    await client.collections(collectionName).synonyms().upsert(synonym.id, {
      synonyms: synonym.synonyms,
    });
    console.log(`✅ Synonym "${synonym.id}" added`);
  }

  console.log('\n✅ All synonyms added successfully');
  await app.close();
}

bootstrap();
