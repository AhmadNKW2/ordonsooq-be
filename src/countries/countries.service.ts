import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Country } from './entities/country.entity';
import { CountryAttribute } from './entities/country-attribute.entity';
import { CreateCountryDto } from './dto/create-country.dto';
import { UpdateCountryDto } from './dto/update-country.dto';

@Injectable()
export class CountriesService {
  constructor(
    @InjectRepository(Country)
    private countriesRepository: Repository<Country>,
    @InjectRepository(CountryAttribute)
    private countryAttributesRepository: Repository<CountryAttribute>,
  ) {}

  async create(createCountryDto: CreateCountryDto): Promise<Country> {
    // Check if country with this countryWorldId already exists
    const existing = await this.countriesRepository.findOne({
      where: { countryWorldId: createCountryDto.countryWorldId },
    });

    if (existing) {
      throw new ConflictException('Country with this countryWorldId already exists');
    }

    const country = this.countriesRepository.create({
      countryWorldId: createCountryDto.countryWorldId,
    });
    
    const savedCountry = await this.countriesRepository.save(country);

    // Create country attributes if provided
    if (createCountryDto.attributes && createCountryDto.attributes.length > 0) {
      const countryAttributes = createCountryDto.attributes.map(attr => 
        this.countryAttributesRepository.create({
          countryId: savedCountry.id,
          attributeId: attr.attributeId,
          value_en: attr.value_en,
          value_ar: attr.value_ar,
        })
      );
      await this.countryAttributesRepository.save(countryAttributes);
    }

    return this.findOne(savedCountry.id);
  }

  async findAll(): Promise<Country[]> {
    return await this.countriesRepository.find({
      relations: ['countryWorld', 'attributes', 'attributes.attribute'],
      order: { id: 'ASC' },
    });
  }

  async findOne(id: number): Promise<Country> {
    const country = await this.countriesRepository.findOne({
      where: { id },
      relations: ['countryWorld', 'attributes', 'attributes.attribute'],
    });

    if (!country) {
      throw new NotFoundException(`Country with ID ${id} not found`);
    }

    return country;
  }

  async update(id: number, updateCountryDto: UpdateCountryDto): Promise<Country> {
    const country = await this.findOne(id);

    if (updateCountryDto.countryWorldId) {
      const existing = await this.countriesRepository.findOne({
        where: { countryWorldId: updateCountryDto.countryWorldId },
      });

      if (existing && existing.id !== id) {
        throw new ConflictException('Country with this countryWorldId already exists');
      }

      country.countryWorldId = updateCountryDto.countryWorldId;
    }

    await this.countriesRepository.save(country);

    // Update attributes if provided
    if (updateCountryDto.attributes) {
      // Remove existing attributes
      await this.countryAttributesRepository.delete({ countryId: id });

      // Add new attributes
      if (updateCountryDto.attributes.length > 0) {
        const countryAttributes = updateCountryDto.attributes.map(attr => 
          this.countryAttributesRepository.create({
            countryId: id,
            attributeId: attr.attributeId,
            value_en: attr.value_en,
            value_ar: attr.value_ar,
          })
        );
        await this.countryAttributesRepository.save(countryAttributes);
      }
    }

    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    const country = await this.findOne(id);
    await this.countriesRepository.remove(country);
  }
}
