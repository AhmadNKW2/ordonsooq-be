import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CountryWorld } from './entities/country-world.entity';
import { CreateCountryWorldDto } from './dto/create-country-world.dto';
import { UpdateCountryWorldDto } from './dto/update-country-world.dto';

@Injectable()
export class CountriesWorldService {
  constructor(
    @InjectRepository(CountryWorld)
    private countriesWorldRepository: Repository<CountryWorld>,
  ) {}

  async create(createCountryWorldDto: CreateCountryWorldDto): Promise<CountryWorld> {
    const countryWorld = this.countriesWorldRepository.create(createCountryWorldDto);
    return await this.countriesWorldRepository.save(countryWorld);
  }

  async findAll(): Promise<CountryWorld[]> {
    return await this.countriesWorldRepository.find();
  }

  async findOne(id: number): Promise<CountryWorld> {
    const countryWorld = await this.countriesWorldRepository.findOne({ where: { id } });
    if (!countryWorld) {
      throw new Error(`CountryWorld with ID ${id} not found`);
    }
    return countryWorld;
  }

  async update(id: number, updateCountryWorldDto: UpdateCountryWorldDto): Promise<CountryWorld> {
    await this.countriesWorldRepository.update(id, updateCountryWorldDto);
    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    await this.countriesWorldRepository.delete(id);
  }
}
