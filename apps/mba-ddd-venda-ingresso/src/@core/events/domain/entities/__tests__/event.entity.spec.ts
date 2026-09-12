import { Event } from '../event.entity';
import { PartnerId } from '../partner.entity';
import { EventSpotId } from '../event-spot';
import { initOrm } from './helpers';

function makeEventComSecao(total_spots: number) {
  const event = Event.create({
    name: 'Evento 1',
    description: 'Descrição do evento 1',
    date: new Date(),
    partner_id: new PartnerId(),
  });

  event.addSection({
    name: 'Sessão 1',
    description: 'Descrição da sessão 1',
    total_spots,
    price: 1000,
  });

  event.publishAll();

  const [section] = event.sections;
  return { event, section };
}

describe('Event Entity Unit Tests', () => {
  initOrm();
  it('deve criar um evento', () => {
    const event = Event.create({
      name: 'Evento 1',
      description: 'Descrição do evento 1',
      date: new Date(),
      partner_id: new PartnerId(),
    });

    event.addSection({
      name: 'Sessão 1',
      description: 'Descrição da sessão 1',
      total_spots: 100,
      price: 1000,
    });

    expect(event.sections.size).toBe(1);
    expect(event.total_spots).toBe(100);

    const [section] = event.sections;

    expect(section.spots.size).toBe(100);

    // const spot = EventSpot.create();

    // section.spots.add(spot);

    // console.dir(event.toJSON(), { depth: 10 });

    // não é valido
    // customer = new Customer({
    //   id: '123', new CustomerId() || new CustomerId('')
    //   name: 'João',
    //   cpf: '99346413050',
    // });
  });

  test('deve publicar todos os itens do evento', () => {
    const event = Event.create({
      name: 'Evento 1',
      description: 'Descrição do evento 1',
      date: new Date(),
      partner_id: new PartnerId(),
    });

    event.addSection({
      name: 'Sessão 1',
      description: 'Descrição da sessão 1',
      total_spots: 100,
      price: 1000,
    });

    event.addSection({
      name: 'Sessão 2',
      description: 'Descrição da sessão 2',
      total_spots: 1000,
      price: 50,
    });

    event.publishAll();

    expect(event.is_published).toBe(true);

    const [section1, section2] = event._sections.values();
    expect(section1.is_published).toBe(true);
    expect(section2.is_published).toBe(true);

    [...section1.spots, ...section2.spots].forEach((spot) => {
      expect(spot.is_published).toBe(true);
    });
  });

  describe('markSpotAsAvailable', () => {
    test('deve liberar um lugar reservado e registrar o EventSpotReleased', () => {
      const { event, section } = makeEventComSecao(2);
      const [spot] = section.spots.values();

      event.markSpotAsReserved({ section_id: section.id, spot_id: spot.id });
      expect(spot.is_reserved).toBe(true);

      event.markSpotAsAvailable({ spot_id: spot.id });
      expect(spot.is_reserved).toBe(false);

      const liberados = [...event.events].filter(
        (e) => e.constructor.name === 'EventSpotReleased',
      );
      expect(liberados).toHaveLength(1);
      expect((liberados[0] as any).aggregate_id.equals(event.id)).toBe(true);
      expect((liberados[0] as any).section_id.equals(section.id)).toBe(true);
      expect((liberados[0] as any).spot_id.equals(spot.id)).toBe(true);
    });

    test('deve lançar Spot not found para um lugar que não existe no evento', () => {
      const { event } = makeEventComSecao(1);

      expect(() =>
        event.markSpotAsAvailable({ spot_id: new EventSpotId() }),
      ).toThrow('Spot not found');
    });
  });

  describe('isSoldOut', () => {
    test('deve ser true quando todos os lugares estão reservados', () => {
      const { event, section } = makeEventComSecao(2);
      const spots = section.spots.values();

      spots.forEach((spot) =>
        event.markSpotAsReserved({ section_id: section.id, spot_id: spot.id }),
      );

      expect(section.isSoldOut()).toBe(true);
    });

    test('deve ser false quando ainda há lugar livre', () => {
      const { event, section } = makeEventComSecao(2);
      const [spot] = section.spots.values();

      event.markSpotAsReserved({ section_id: section.id, spot_id: spot.id });

      expect(section.isSoldOut()).toBe(false);
    });

    test('deve derivar da disponibilidade dos lugares, não de total_spots_reserved', () => {
      const { event, section } = makeEventComSecao(2);
      const spots = section.spots.values();

      spots.forEach((spot) =>
        event.markSpotAsReserved({ section_id: section.id, spot_id: spot.id }),
      );

      expect(section.total_spots_reserved).toBe(0);
      expect(section.isSoldOut()).toBe(true);
    });

    test('deve voltar a false depois de liberar um lugar', () => {
      const { event, section } = makeEventComSecao(1);
      const [spot] = section.spots.values();

      event.markSpotAsReserved({ section_id: section.id, spot_id: spot.id });
      expect(section.isSoldOut()).toBe(true);

      event.markSpotAsAvailable({ spot_id: spot.id });
      expect(section.isSoldOut()).toBe(false);
    });
  });
});
